// ── NoteManager ──────────────────────────────────────────────────────────────
class NoteManager {
  constructor() {
    this.colors  = ["blue", "pink", "green", "yellow", "purple"];
    this.board   = document.getElementById("board");
    this.counter = document.getElementById("note-count");
    this._darkMQ = window.matchMedia("(prefers-color-scheme: dark)");
    this._dragEl = null;
    this._notes  = []; // array interno para evitar querySelectorAll repetidos

    this._bindToolbar();
    this._bindModal();
    this._bindBoard();
    this._bindHelp();
    this.loadNotes();

    this._darkMQ.addEventListener("change", () => this._updateThumbTacks());
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  _randomColor() {
    return this.colors[Math.floor(Math.random() * this.colors.length)];
  }

  // Rotación aleatoria entre -2° y +2° para efecto de tablero real.
  // Devuelve un string numérico SIN unidad — la unidad la agrega el CSS.
  _randomRotation() {
    return (Math.random() * 4 - 2).toFixed(2);
  }

  _colorVar(name) {
    return `var(--${name})`;
  }

  _colorName(stored) {
    if (!stored) return "yellow";
    if (this.colors.includes(stored)) return stored;
    const varMatch = stored.match(/^var\(--(\w+)\)$/);
    if (varMatch && this.colors.includes(varMatch[1])) return varMatch[1];
    const legacyMap = {
      "#b5e9ec": "blue",  "rgb(181, 233, 236)": "blue",
      "#fec3dd": "pink",  "rgb(254, 195, 221)": "pink",
      "#bbe9ba": "green", "rgb(187, 233, 186)": "green",
      "#f9e558": "yellow","rgb(249, 229, 88)":  "yellow",
      "#ccaafe": "purple","rgb(204, 170, 254)": "purple",
    };
    return legacyMap[stored] ?? "yellow";
  }

  _debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  _thumbtackSrc() {
    return this._darkMQ.matches
      ? "./images/black-thumbtack.png"
      : "./images/white-thumbtack.png";
  }

  _updateCounter() {
    const n = this._notes.length;
    this.counter.textContent = n === 1 ? "1 nota" : `${n} notas`;
  }

  _updateThumbTacks() {
    const src = this._thumbtackSrc();
    this._notes.forEach(note => {
      const img = note.querySelector(".thumbtack");
      if (img) img.src = src;
    });
  }

  // ── Cálculo de líneas visuales ─────────────────────────────────────────────

  _getLineHeight(textArea) {
    const fs = parseFloat(getComputedStyle(textArea).fontSize);
    return Math.round(fs * 1.4);
  }

  _getMaxLines(textArea) {
    const lh = this._getLineHeight(textArea);
    return Math.max(1, Math.floor(textArea.clientHeight / lh));
  }

  _getCurrentLines(textArea) {
    const lh = this._getLineHeight(textArea);
    const ruler = document.createElement("span");
    ruler.style.cssText = "display:block;visibility:hidden;pointer-events:none;";
    // Clonar nodos del DOM en vez de copiar innerHTML para evitar XSS
    Array.from(textArea.childNodes).forEach(node =>
      ruler.appendChild(node.cloneNode(true))
    );
    if (!ruler.hasChildNodes()) ruler.appendChild(document.createElement("br"));
    textArea.appendChild(ruler);
    const h = ruler.getBoundingClientRect().height;
    ruler.remove();
    return Math.max(1, Math.round((h + 2) / lh));
  }

  // ── Configurar límite de líneas ────────────────────────────────────────────

  _setupLineLimit(textArea, lineCount) {
    const saveDebounced = this._debounce(() => this.saveNotes(), 400);
    // snapshot seguro: guardamos los nodos del DOM, no el HTML serializado
    let _snapshotNodes = [];
    const _saveSnapshot = () => {
      _snapshotNodes = Array.from(textArea.childNodes).map(n => n.cloneNode(true));
    };
    const _restore = () => {
      textArea.replaceChildren(..._snapshotNodes.map(n => n.cloneNode(true)));
      const range = document.createRange();
      const sel   = window.getSelection();
      range.selectNodeContents(textArea);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    };
    _saveSnapshot();

    const isFull = () =>
      this._getCurrentLines(textArea) > this._getMaxLines(textArea);

    const updateCount = () => {
      const cur = this._getCurrentLines(textArea);
      const max = this._getMaxLines(textArea);
      const pct = cur / max;
      lineCount.textContent = `${cur}/${max}`;
      lineCount.classList.remove("warning", "full");
      if (pct >= 1)          lineCount.classList.add("full");
      else if (pct >= 0.85)  lineCount.classList.add("warning");
    };

    const ALLOWED_KEYS = new Set([
      "Backspace","Delete","ArrowLeft","ArrowRight",
      "ArrowUp","ArrowDown","Home","End","Escape","Tab"
    ]);

    textArea.addEventListener("keydown", (e) => {
      if (ALLOWED_KEYS.has(e.key) || e.ctrlKey || e.metaKey) return;
      if (isFull()) e.preventDefault();
    });

    textArea.addEventListener("beforeinput", (e) => {
      if (!e.data) return;
      if (isFull()) e.preventDefault();
    });

    textArea.addEventListener("input", () => {
      if (this._getCurrentLines(textArea) > this._getMaxLines(textArea)) {
        _restore();
      } else {
        _saveSnapshot();
      }
      updateCount();
      saveDebounced();
    });

    textArea.addEventListener("paste", (e) => {
      e.preventDefault();
      if (isFull()) return;
      const pasted = (e.clipboardData || window.clipboardData).getData("text/plain");
      // Guardar snapshot previo al paste para poder revertir si desborda
      const preNodes = Array.from(textArea.childNodes).map(n => n.cloneNode(true));
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(pasted));
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      if (this._getCurrentLines(textArea) > this._getMaxLines(textArea)) {
        textArea.replaceChildren(...preNodes.map(n => n.cloneNode(true)));
        const range = document.createRange();
        const sel2  = window.getSelection();
        range.selectNodeContents(textArea);
        range.collapse(false);
        sel2.removeAllRanges();
        sel2.addRange(range);
      } else {
        _saveSnapshot();
      }
      updateCount();
      saveDebounced();
    });

    textArea.addEventListener("focus", () => {
      _saveSnapshot();
      updateCount();
    });

    updateCount();
  }

  // ── Crear nota ─────────────────────────────────────────────────────────────

  createNote(content = "", color = null, id = crypto.randomUUID(), rotation = null) {
    const colorName = this._colorName(color ?? this._randomColor());
    const note = document.createElement("div");
    note.classList.add("note");
    note.style.background = this._colorVar(colorName);
    note.dataset.color    = colorName;
    note.dataset.id       = id;

    const rot = parseFloat(rotation) || parseFloat(this._randomRotation());
    note.dataset.rotation = rot;
    note.style.setProperty("--rotation", `${rot}deg`);

    note.setAttribute("role", "article");
    note.setAttribute("aria-label", "Nota adhesiva");

    // Chinche
    const img     = document.createElement("img");
    img.src       = this._thumbtackSrc();
    img.title     = "Eliminar nota";
    img.alt       = "Eliminar nota";
    img.draggable = false;
    img.classList.add("thumbtack");
    img.setAttribute("role", "button");
    img.setAttribute("tabindex", "0");
    img.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this._removeNote(note);
      }
    });

    // Área de texto
    const textArea       = document.createElement("div");
    textArea.classList.add("input");
    textArea.contentEditable = "true";
    textArea.spellcheck      = false;
    textArea.setAttribute("aria-label", "Contenido de la nota");
    textArea.setAttribute("aria-multiline", "true");
    textArea.addEventListener("mousedown",  (e) => e.stopPropagation());
    textArea.addEventListener("touchstart", (e) => e.stopPropagation(), { passive: true });
    textArea.innerText = this._sanitizeContent(content);

    // Contador de líneas (oculto visualmente, usado internamente)
    const lineCount = document.createElement("span");
    lineCount.classList.add("char-count");

    // Selector de colores
    const picker = document.createElement("div");
    picker.classList.add("color-picker");
    picker.setAttribute("aria-label", "Cambiar color de la nota");
    this.colors.forEach(name => {
      const dot = document.createElement("button");
      dot.classList.add("color-dot");
      dot.style.background = this._colorVar(name);
      dot.title = "Cambiar a este color";
      dot.setAttribute("aria-label", `Color ${name}`);
      dot.addEventListener("mousedown", (e) => e.stopPropagation());
      dot.addEventListener("click", (e) => {
        e.stopPropagation();
        note.style.background = this._colorVar(name);
        note.dataset.color = name;
        this.saveNotes();
      });
      picker.appendChild(dot);
    });

    this._makeDraggable(note);

    note.appendChild(img);
    note.appendChild(textArea);
    note.appendChild(lineCount);
    note.appendChild(picker);
    this.board.appendChild(note);
    this._notes.push(note); // registrar en array interno

    requestAnimationFrame(() => this._setupLineLimit(textArea, lineCount));
    this._updateCounter();
    return note;
  }

  // ── Sanitizar contenido al cargar ─────────────────────────────────────────
  // Usa un TextNode en vez de innerHTML para nunca parsear HTML arbitrario.
  // Esto evita que contenido malicioso guardado en localStorage
  // sea interpretado por el navegador antes de extraer el texto plano.

  _sanitizeContent(raw) {
    if (typeof raw !== "string") return "";
    // Limitar longitud para evitar strings enormes desde localStorage manipulado
    const clamped = raw.slice(0, 10000);
    const tmp = document.createElement("div");
    tmp.appendChild(document.createTextNode(clamped));
    return tmp.innerText || tmp.textContent || "";
  }

  // ── Eliminar nota ─────────────────────────────────────────────────────────

  _removeNote(note) {
    note.classList.add("removing");
    note.addEventListener("animationend", () => {
      note.remove();
      this._notes = this._notes.filter(n => n !== note);
      this.saveNotes();
      this._updateCounter();
    }, { once: true });
  }

  // ── Drag & Drop ────────────────────────────────────────────────────────────

  _makeDraggable(note) {
    note.draggable = true;

    // ── Drag & Drop mouse (desktop) ──
    note.addEventListener("dragstart", (e) => {
      this._dragEl = note;
      setTimeout(() => {
        note.classList.add("dragging");
        note.style.animation = "none";
      }, 0);
      e.dataTransfer.effectAllowed = "move";
    });
    note.addEventListener("dragend", () => {
      note.classList.remove("dragging");
      note.style.animation = "";
      this._dragEl = null;
      this.saveNotes();
    });
    note.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (!this._dragEl || this._dragEl === note) return;
      const rect   = note.getBoundingClientRect();
      const midX   = rect.left + rect.width  / 2;
      const midY   = rect.top  + rect.height / 2;
      const before = e.clientY < midY || (e.clientY === midY && e.clientX < midX);
      this.board.insertBefore(this._dragEl, before ? note : note.nextSibling);
    });

    // ── Drag & Drop touch (móvil) ──
    let _touchStartX = 0, _touchStartY = 0;
    let _touchMoved  = false;

    note.addEventListener("touchstart", (e) => {
      // Si el toque es en el textarea, no iniciar drag
      if (e.target.closest(".input")) return;
      const t = e.touches[0];
      _touchStartX = t.clientX;
      _touchStartY = t.clientY;
      _touchMoved  = false;

      this._dragEl = note;
      note.style.animation = "none";
    }, { passive: true });

    note.addEventListener("touchmove", (e) => {
      if (!this._dragEl) return;
      _touchMoved = true;
      note.classList.add("dragging");

      const t = e.touches[0];
      // Encontrar el elemento debajo del dedo (ocultando la nota arrastrada)
      note.style.visibility = "hidden";
      const below = document.elementFromPoint(t.clientX, t.clientY);
      note.style.visibility = "";

      const target = below?.closest(".note");
      if (target && target !== note) {
        const rect   = target.getBoundingClientRect();
        const midY   = rect.top  + rect.height / 2;
        const midX   = rect.left + rect.width  / 2;
        const before = t.clientY < midY || (t.clientY === midY && t.clientX < midX);
        this.board.insertBefore(note, before ? target : target.nextSibling);
      }
      // Actualizar posición en _notes para que saveNotes refleje el orden visual
      this._notes = [...this.board.querySelectorAll(".note")];
    }, { passive: true });

    note.addEventListener("touchend", () => {
      if (!this._dragEl) return;
      note.classList.remove("dragging");
      note.style.animation = "";
      this._dragEl = null;
      if (_touchMoved) this.saveNotes();
    });
  }

  // ── Guardar / Cargar ───────────────────────────────────────────────────────

  saveNotes() {
    const data = this._notes.map(note => {
      const raw  = note.querySelector(".input").innerText || "";
      const text = raw.replace(/\n$/, "");
      return {
        id:       note.dataset.id,
        content:  text,
        color:    note.dataset.color,
        rotation: note.dataset.rotation,
      };
    });
    localStorage.setItem("sticky-notes", JSON.stringify(data));
  }

  loadNotes() {
    const saved = localStorage.getItem("sticky-notes");
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) throw new Error("formato inválido");
      parsed.forEach(n => {
        // Validar que cada campo sea del tipo esperado y tenga longitud razonable
        const content  = typeof n.content  === "string" ? n.content.slice(0, 10000) : "";
        const color    = typeof n.color    === "string" ? n.color                   : null;
        const id       = typeof n.id       === "string" ? n.id.slice(0, 64)         : crypto.randomUUID();
        const rotation = isFinite(parseFloat(n.rotation)) ? n.rotation              : this._randomRotation();
        this.createNote(content, color, id, rotation);
      });
    } catch {
      localStorage.removeItem("sticky-notes");
    }
  }

  // ── Borrar todo ────────────────────────────────────────────────────────────

  clearAll() {
    localStorage.removeItem("sticky-notes");
    this._notes.forEach(n => {
      n.classList.add("removing");
      n.addEventListener("animationend", () => n.remove(), { once: true });
    });
    this._notes = [];
    setTimeout(() => this._updateCounter(), 300);
  }

  // ── Bindings ───────────────────────────────────────────────────────────────

  _bindToolbar() {
    document.getElementById("create").addEventListener("click", () => {
      const note = this.createNote();
      this.saveNotes();
      requestAnimationFrame(() => {
        note.scrollIntoView({ behavior: "smooth", block: "center" });
        note.querySelector(".input")?.focus();
      });
    });
  }

  _bindModal() {
    const overlay = document.getElementById("modal-overlay");
    const confirm = document.getElementById("modal-confirm");
    const cancel  = document.getElementById("modal-cancel");

    document.getElementById("clear-all").addEventListener("click", () => {
      if (this._notes.length === 0) return;
      overlay.hidden = false;
      confirm.focus();
    });
    confirm.addEventListener("click", () => { overlay.hidden = true; this.clearAll(); });
    cancel.addEventListener("click",  () => { overlay.hidden = true; });
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.hidden = true; });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !overlay.hidden) overlay.hidden = true;
    });
  }

  _bindHelp() {
    const btn   = document.getElementById("help-btn");
    const panel = document.getElementById("help-panel");
    const close = document.getElementById("help-close");

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = panel.hidden;
      panel.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
    });
    close.addEventListener("click", () => {
      panel.hidden = true;
      btn.setAttribute("aria-expanded", "false");
    });
    document.addEventListener("click", (e) => {
      if (!panel.hidden && !panel.contains(e.target) && e.target !== btn) {
        panel.hidden = true;
        btn.setAttribute("aria-expanded", "false");
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !panel.hidden) {
        panel.hidden = true;
        btn.setAttribute("aria-expanded", "false");
      }
    });
  }

  _bindBoard() {
    this.board.addEventListener("click", (e) => {
      const thumbtack = e.target.closest(".thumbtack");
      if (thumbtack) {
        const note = thumbtack.closest(".note");
        if (note) this._removeNote(note);
      }
    });
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────
const app = new NoteManager();