// ── NoteManager ──────────────────────────────────────────────────────────────
class NoteManager {
  constructor() {
    this.colors  = ["#b5e9ec", "#fec3dd", "#bbe9ba", "#f9e558", "#ccaafe"];
    this.board   = document.getElementById("board");
    this.counter = document.getElementById("note-count");
    this._darkMQ = window.matchMedia("(prefers-color-scheme: dark)");
    this._dragEl = null;

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

  _debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  _updateCounter() {
    const n = this.board.querySelectorAll(".note").length;
    this.counter.textContent = n === 1 ? "1 nota" : `${n} notas`;
  }

  _thumbtackSrc() {
    return this._darkMQ.matches
      ? "./images/black-thumbtack.png"
      : "./images/white-thumbtack.png";
  }

  _updateThumbTacks() {
    const src = this._thumbtackSrc();
    this.board.querySelectorAll(".thumbtack").forEach(img => { img.src = src; });
  }

  // ── Cálculo de líneas visuales ─────────────────────────────────────────────
  // Lee el font-size computado y lo multiplica por el line-height del CSS (1.4).
  // Usar getComputedStyle garantiza que funciona en todos los navegadores
  // independientemente de breakpoints o zoom del sistema.

  _getLineHeight(textArea) {
    const fs = parseFloat(getComputedStyle(textArea).fontSize);
    return Math.round(fs * 1.4);
  }

  // Cantidad máxima de líneas que caben sin scroll,
  // basada en la altura interior real del elemento.
  _getMaxLines(textArea) {
    const lh = this._getLineHeight(textArea);
    return Math.max(1, Math.floor(textArea.clientHeight / lh));
  }

  // Líneas visuales que ocupa el contenido actual.
  // Usamos un nodo <span> interno para medir solo la altura del contenido,
  // evitando que el padding del contenedor infle el scrollHeight.
  // Cross-browser: Chrome, Firefox, Safari, Edge.
  _getCurrentLines(textArea) {
    const lh = this._getLineHeight(textArea);
    const ruler = document.createElement("span");
    ruler.style.cssText = "display:block;visibility:hidden;pointer-events:none;";
    ruler.innerHTML = textArea.innerHTML || "<br>";
    textArea.appendChild(ruler);
    const h = ruler.getBoundingClientRect().height;
    ruler.remove();
    // Usar round con tolerancia de 2px para no penalizar subpíxeles
    // cuando el contenido llena exactamente el contenedor
    return Math.max(1, Math.round((h + 2) / lh));
  }

  // ── Configurar límite de líneas ────────────────────────────────────────────

  _setupLineLimit(textArea, lineCount) {
    const saveDebounced = this._debounce(() => this.saveNotes(), 400);

    // snapshot para restaurar en caso de desborde (compatible con Safari,
    // donde execCommand("undo") está deprecado y puede fallar)
    let _snapshot = textArea.innerHTML;

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

    // Restaurar al snapshot y reposicionar el cursor al final del texto
    const _restore = () => {
      textArea.innerHTML = _snapshot;
      const range = document.createRange();
      const sel   = window.getSelection();
      range.selectNodeContents(textArea);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    };

    // Teclas que siempre se permiten aunque esté lleno
    const ALLOWED_KEYS = new Set([
      "Backspace","Delete","ArrowLeft","ArrowRight",
      "ArrowUp","ArrowDown","Home","End","Escape","Tab"
    ]);

    // Primera línea de defensa: bloquear antes de que el carácter se inserte
    textArea.addEventListener("keydown", (e) => {
      if (ALLOWED_KEYS.has(e.key) || e.ctrlKey || e.metaKey) return;
      if (isFull()) e.preventDefault();
    });

    // Segunda línea: beforeinput (Chrome, Edge, Safari modernos)
    textArea.addEventListener("beforeinput", (e) => {
      if (!e.data) return; // deja pasar borrado, etc.
      if (isFull()) e.preventDefault();
    });

    // Actualizar snapshot cuando el contenido cambia válidamente,
    // y restaurar si de algún modo (dictado, autocompletar móvil) se desbordó
    textArea.addEventListener("input", () => {
      if (this._getCurrentLines(textArea) > this._getMaxLines(textArea)) {
        _restore();
      } else {
        _snapshot = textArea.innerHTML;
      }
      updateCount();
      saveDebounced();
    });

    // Paste: insertar solo texto plano; deshacer si desborda
    textArea.addEventListener("paste", (e) => {
      e.preventDefault();
      if (isFull()) return;

      const pasted = (e.clipboardData || window.clipboardData)
        .getData("text/plain");

      // Guardar snapshot previo al paste para poder revertir
      const preSnapshot = textArea.innerHTML;
      document.execCommand("insertText", false, pasted);

      if (this._getCurrentLines(textArea) > this._getMaxLines(textArea)) {
        textArea.innerHTML = preSnapshot;
        const range = document.createRange();
        const sel   = window.getSelection();
        range.selectNodeContents(textArea);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        _snapshot = textArea.innerHTML;
      }
      updateCount();
      saveDebounced();
    });

    // Actualizar el snapshot al enfocar (para tener siempre un punto de retorno válido)
    textArea.addEventListener("focus", () => {
      _snapshot = textArea.innerHTML;
      updateCount();
    });

    updateCount();
  }

  // ── Crear nota ─────────────────────────────────────────────────────────────

  createNote(content = "", color = this._randomColor(), id = crypto.randomUUID()) {
    const note = document.createElement("div");
    note.classList.add("note");
    note.style.background = color;
    note.dataset.id = id;
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

    // El contenido se asigna como texto plano para evitar HTML enriquecido
    // de sesiones anteriores o de paste. No hace falta truncar aquí porque
    // _setupLineLimit detecta y restaura si el contenido cargado desborda.
    textArea.innerText = this._sanitizeContent(content);

    // Contador de líneas
    const lineCount = document.createElement("span");
    lineCount.classList.add("char-count"); // reutiliza los estilos existentes

    // Selector de colores
    const picker = document.createElement("div");
    picker.classList.add("color-picker");
    picker.setAttribute("aria-label", "Cambiar color de la nota");
    this.colors.forEach(c => {
      const dot = document.createElement("button");
      dot.classList.add("color-dot");
      dot.style.background = c;
      dot.title = "Cambiar a este color";
      dot.setAttribute("aria-label", `Color ${c}`);
      dot.addEventListener("mousedown", (e) => e.stopPropagation());
      dot.addEventListener("click", (e) => {
        e.stopPropagation();
        note.style.background = c;
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

    // Diferir _setupLineLimit un frame para que el navegador haya calculado
    // el layout real antes de leer clientHeight / getBoundingClientRect
    requestAnimationFrame(() => this._setupLineLimit(textArea, lineCount));
    this._updateCounter();
    return note;
  }

  // ── Sanitizar contenido al cargar ─────────────────────────────────────────
  // Extrae solo texto plano descartando cualquier HTML enriquecido
  // que pueda haberse guardado en sesiones anteriores.

  _sanitizeContent(html) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return tmp.innerText || tmp.textContent || "";
  }

  // ── Eliminar nota ─────────────────────────────────────────────────────────

  _removeNote(note) {
    note.classList.add("removing");
    note.addEventListener("animationend", () => {
      note.remove();
      this.saveNotes();
      this._updateCounter();
    }, { once: true });
  }

  // ── Drag & Drop ────────────────────────────────────────────────────────────

  _makeDraggable(note) {
    note.draggable = true;
    note.addEventListener("dragstart", (e) => {
      this._dragEl = note;
      setTimeout(() => note.classList.add("dragging"), 0);
      e.dataTransfer.effectAllowed = "move";
    });
    note.addEventListener("dragend", () => {
      note.classList.remove("dragging");
      this._dragEl = null;
      this.saveNotes();
    });
    note.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (!this._dragEl || this._dragEl === note) return;
      const rect = note.getBoundingClientRect();
      const mid  = rect.left + rect.width / 2;
      this.board.insertBefore(this._dragEl, e.clientX < mid ? note : note.nextSibling);
    });
  }

  // ── Guardar / Cargar ───────────────────────────────────────────────────────
  // Se guarda el texto plano del innerText. Ya no es necesario truncar
  // por caracteres porque el límite de líneas lo garantiza en tiempo real.

  saveNotes() {
    const notes = [];
    this.board.querySelectorAll(".note").forEach(note => {
      const raw  = note.querySelector(".input").innerText || "";
      const text = raw.replace(/\n$/, "");
      notes.push({
        id:      note.dataset.id,
        content: text,
        color:   note.style.background,
      });
    });
    localStorage.setItem("sticky-notes", JSON.stringify(notes));
  }

  loadNotes() {
    const saved = localStorage.getItem("sticky-notes");
    if (!saved) return;
    try {
      JSON.parse(saved).forEach(n => this.createNote(n.content, n.color, n.id));
    } catch {
      localStorage.removeItem("sticky-notes");
    }
  }

  // ── Borrar todo ────────────────────────────────────────────────────────────

  clearAll() {
    [...this.board.querySelectorAll(".note")].forEach(n => {
      n.classList.add("removing");
      n.addEventListener("animationend", () => n.remove(), { once: true });
    });
    setTimeout(() => { this.saveNotes(); this._updateCounter(); }, 300);
  }

  // ── Bindings ───────────────────────────────────────────────────────────────

  _bindToolbar() {
    document.getElementById("create").addEventListener("click", () => {
      const note = this.createNote();
      this.saveNotes();
      requestAnimationFrame(() => note.querySelector(".input")?.focus());
    });
  }

  _bindModal() {
    const overlay = document.getElementById("modal-overlay");
    const confirm = document.getElementById("modal-confirm");
    const cancel  = document.getElementById("modal-cancel");

    document.getElementById("clear-all").addEventListener("click", () => {
      if (!this.board.querySelector(".note")) return;
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