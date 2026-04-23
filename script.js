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

  // ── Límite de caracteres por breakpoint ────────────────────────────────────
  // Calculado con el carácter más ancho de Caveat como referencia,
  // siendo conservadores para que el texto nunca desborde visualmente.
  // El límite se recalcula cada vez que se necesita, por si el usuario
  // redimensiona la ventana entre sesiones.

  _getCharLimit() {
    const w = window.innerWidth;
    if (w <= 320) return 100;
    if (w <= 400) return 120;
    if (w <= 640) return 160;
    return 200;
  }

  // ── Configurar límite de caracteres ───────────────────────────────────────

  _setupCharLimit(textArea, charCount) {
    const saveDebounced = this._debounce(() => this.saveNotes(), 400);

    const getLen  = () => textArea.innerText.replace(/\n$/, "").length;
    const limit   = () => this._getCharLimit();

    const updateCount = () => {
      const len = getLen();
      const max = limit();
      const pct = len / max;
      charCount.textContent = `${len}/${max}`;
      charCount.classList.remove("warning", "full");
      if (pct >= 1)    charCount.classList.add("full");
      else if (pct >= 0.85) charCount.classList.add("warning");
    };

    // Bloquear escritura cuando se alcanza el límite
    const ALLOWED_KEYS = new Set([
      "Backspace","Delete","ArrowLeft","ArrowRight","ArrowUp","ArrowDown",
      "Home","End","Escape","Tab"
    ]);

    textArea.addEventListener("keydown", (e) => {
      if (ALLOWED_KEYS.has(e.key)) return;
      if (e.ctrlKey || e.metaKey) return; // Ctrl+A, Ctrl+C, Ctrl+Z, etc.
      if (getLen() >= limit()) {
        e.preventDefault();
      }
    });

    // Doble seguridad: beforeinput (Chrome, Edge, Safari)
    textArea.addEventListener("beforeinput", (e) => {
      if (!e.data) return;
      if (getLen() >= limit()) {
        e.preventDefault();
      }
    });

    // Red de seguridad para dictado / autocompletar en móvil
    textArea.addEventListener("input", () => {
      const max = limit();
      if (getLen() > max) {
        // Truncar preservando la posición del cursor
        const sel    = window.getSelection();
        const offset = sel.anchorOffset;
        const node   = textArea.firstChild;
        textArea.innerText = textArea.innerText.slice(0, max);
        // Reposicionar cursor
        try {
          if (node && textArea.firstChild) {
            const range = document.createRange();
            range.setStart(textArea.firstChild, Math.min(offset, max));
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
          }
        } catch (_) {}
      }
      updateCount();
      saveDebounced();
    });

    // Paste: insertar solo texto plano y truncar si supera el límite
    textArea.addEventListener("paste", (e) => {
      e.preventDefault();
      const max       = limit();
      const current   = getLen();
      const available = Math.max(0, max - current);
      if (available === 0) return;

      const pasted = (e.clipboardData || window.clipboardData)
        .getData("text/plain")
        .slice(0, available);

      document.execCommand("insertText", false, pasted);
      updateCount();
      saveDebounced();
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

    // Truncar el contenido cargado si supera el límite actual
    const max     = this._getCharLimit();
    const trimmed = this._truncateHTML(content, max);
    textArea.innerHTML = trimmed;

    // Contador
    const charCount = document.createElement("span");
    charCount.classList.add("char-count");

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
    note.appendChild(charCount);
    note.appendChild(picker);
    this.board.appendChild(note);

    this._setupCharLimit(textArea, charCount);
    this._updateCounter();
    return note;
  }

  // ── Truncar HTML preservando etiquetas básicas ─────────────────────────────
  // Extrae solo el texto plano y lo recorta; descarta cualquier HTML complejo
  // que pueda haberse colado por paste enriquecido en sesiones anteriores.

  _truncateHTML(html, max) {
    const tmp  = document.createElement("div");
    tmp.innerHTML = html;
    const text = tmp.innerText || tmp.textContent || "";
    return text.slice(0, max);
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
  // Al guardar se trunca el texto al límite actual para que nunca se
  // guarde más de lo que es visible en pantalla.

  saveNotes() {
    const max   = this._getCharLimit();
    const notes = [];
    this.board.querySelectorAll(".note").forEach(note => {
      const raw  = note.querySelector(".input").innerText || "";
      const text = raw.replace(/\n$/, "").slice(0, max);
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