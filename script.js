// ── NoteManager ──────────────────────────────────────────────────────────────
class NoteManager {
  constructor() {
    this.colors  = ["blue", "pink", "green", "yellow", "purple"];
    this.board   = document.getElementById("board");
    this.counter = document.getElementById("note-count");
    this.modal = {
      overlay: document.getElementById("modal-overlay"),
      title:   document.getElementById("modal-title"),
      confirm: document.getElementById("modal-confirm"),
      cancel:  document.getElementById("modal-cancel"),
    };
    this._darkMQ = window.matchMedia("(prefers-color-scheme: dark)");
    this._dragEl = null;
    this._notes  = [];
    this._modalAction = null;
    this._modalOnClose = null;
    this._modalReturnFocus = null;

    this._bindToolbar();
    this._bindModal();
    this._bindBoard();
    this._bindHelp();
    this._bindColorMenus();
    this.loadNotes();

    this._darkMQ.addEventListener("change", () => this._updateThumbTacks());
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HELPERS GENERALES
  // ══════════════════════════════════════════════════════════════════════════

  _randomColor() {
    return this.colors[Math.floor(Math.random() * this.colors.length)];
  }

  _randomRotation() {
    return (Math.random() * 4 - 2).toFixed(2);
  }

  _newId() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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

  _sanitizeContent(raw) {
    if (typeof raw !== "string") return "";
    const clamped = raw.slice(0, 10000);
    const tmp = document.createElement("div");
    tmp.appendChild(document.createTextNode(clamped));
    return tmp.innerText || tmp.textContent || "";
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

  // ══════════════════════════════════════════════════════════════════════════
  // CÁLCULO DE LÍNEAS
  // ══════════════════════════════════════════════════════════════════════════

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
    Array.from(textArea.childNodes).forEach(node =>
      ruler.appendChild(node.cloneNode(true))
    );
    if (!ruler.hasChildNodes()) ruler.appendChild(document.createElement("br"));
    textArea.appendChild(ruler);
    const h = ruler.getBoundingClientRect().height;
    ruler.remove();
    return Math.max(1, Math.round((h + 2) / lh));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LÍMITE DE LÍNEAS — cada método tiene una sola responsabilidad
  // ══════════════════════════════════════════════════════════════════════════

  /** Devuelve funciones para guardar y restaurar un snapshot de nodos del DOM. */
  _createSnapshot(textArea) {
    let nodes = [];
    const save = () => {
      nodes = Array.from(textArea.childNodes).map(n => n.cloneNode(true));
    };
    const restore = () => {
      textArea.replaceChildren(...nodes.map(n => n.cloneNode(true)));
      const range = document.createRange();
      const sel   = window.getSelection();
      range.selectNodeContents(textArea);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    };
    save(); // snapshot inicial
    return { save, restore };
  }

  /** Actualiza el texto del contador y aplica clases visuales de advertencia. */
  _updateLineCount(textArea, lineCount) {
    const cur = this._getCurrentLines(textArea);
    const max = this._getMaxLines(textArea);
    const pct = cur / max;
    lineCount.textContent = `${cur}/${max}`;
    lineCount.classList.remove("warning", "full");
    if (pct >= 1)         lineCount.classList.add("full");
    else if (pct >= 0.85) lineCount.classList.add("warning");
  }

  /**
   * Enlaza los eventos de teclado e input que impiden superar el límite de
   * líneas. Recibe `isFull` (función), `snapshot` y `saveDebounced`.
   */
  _bindInputGuards(textArea, { isFull, snapshot, saveDebounced, lineCount }) {
    const ALLOWED_KEYS = new Set([
      "Backspace","Delete","ArrowLeft","ArrowRight",
      "ArrowUp","ArrowDown","Home","End","Escape","Tab",
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
        snapshot.restore();
      } else {
        snapshot.save();
      }
      this._updateLineCount(textArea, lineCount);
      saveDebounced();
    });

    textArea.addEventListener("paste", (e) => {
      e.preventDefault();
      if (isFull()) return;

      const preNodes = Array.from(textArea.childNodes).map(n => n.cloneNode(true));
      const pasted   = (e.clipboardData || window.clipboardData).getData("text/plain");
      const sel      = window.getSelection();

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
        snapshot.save();
      }

      this._updateLineCount(textArea, lineCount);
      saveDebounced();
    });

    textArea.addEventListener("focus", () => {
      snapshot.save();
      this._updateLineCount(textArea, lineCount);
    });
  }

  /** Punto de entrada: coordina snapshot, guards y contador. */
  _setupLineLimit(textArea, lineCount) {
    const saveDebounced = this._debounce(() => this.saveNotes(), 400);
    const snapshot = this._createSnapshot(textArea);
    const isFull   = () => this._getCurrentLines(textArea) > this._getMaxLines(textArea);

    this._bindInputGuards(textArea, { isFull, snapshot, saveDebounced, lineCount });
    this._updateLineCount(textArea, lineCount);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CONSTRUCCIÓN DEL DOM DE CADA NOTA
  // ══════════════════════════════════════════════════════════════════════════

  /** Botón con chinche que elimina la nota al hacer clic. */
  _buildThumbTack() {
    const button = document.createElement("button");
    button.type  = "button";
    button.classList.add("thumbtack-button");
    button.title = "Eliminar nota";
    button.setAttribute("aria-label", "Eliminar nota");
    button.addEventListener("mousedown", (e) => e.stopPropagation());

    const img     = document.createElement("img");
    img.src       = this._thumbtackSrc();
    img.alt       = "";
    img.draggable = false;
    img.classList.add("thumbtack");
    img.setAttribute("aria-hidden", "true");
    button.appendChild(img);

    return button;
  }

  /** Área de texto editable con el contenido inicial. */
  _buildTextArea(content) {
    const textArea           = document.createElement("div");
    textArea.classList.add("input");
    textArea.contentEditable = "true";
    textArea.spellcheck      = false;
    textArea.setAttribute("role", "textbox");
    textArea.setAttribute("aria-label", "Contenido de la nota");
    textArea.setAttribute("aria-multiline", "true");
    textArea.addEventListener("mousedown",  (e) => e.stopPropagation());
    textArea.addEventListener("touchstart", (e) => e.stopPropagation(), { passive: true });
    textArea.innerText = this._sanitizeContent(content);
    return textArea;
  }

  /** Picker de colores horizontal (visible en desktop). */
  _buildColorPicker(note, triggerButton) {
    const picker = document.createElement("div");
    picker.classList.add("color-picker");
    picker.setAttribute("role", "group");
    picker.setAttribute("aria-label", "Cambiar color de la nota");

    this.colors.forEach(name => {
      const dot = this._createColorButton(name, selected => {
        this._applyColor(note, triggerButton, selected);
      });
      picker.appendChild(dot);
    });

    return picker;
  }

  /** Menú desplegable de colores (visible en móvil / pantallas táctiles). */
  _buildColorMenu(note, colorName) {
    const colorMenu = document.createElement("div");
    colorMenu.classList.add("color-menu");
    colorMenu.setAttribute("role", "group");
    colorMenu.setAttribute("aria-label", "Cambiar color de la nota");

    const trigger = document.createElement("button");
    trigger.classList.add("color-menu-trigger");
    trigger.style.background = this._colorVar(colorName);
    trigger.title = "Cambiar color";
    trigger.setAttribute("aria-label", "Cambiar color de la nota");
    trigger.setAttribute("aria-expanded", "false");
    trigger.addEventListener("mousedown", (e) => e.stopPropagation());
    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const willOpen = !colorMenu.classList.contains("open");
      this._closeColorMenus(colorMenu);
      colorMenu.classList.toggle("open", willOpen);
      trigger.setAttribute("aria-expanded", String(willOpen));
    });

    const panel = document.createElement("div");
    panel.classList.add("color-menu-panel");

    this.colors.forEach(name => {
      const dot = this._createColorButton(name, selected => {
        this._applyColor(note, trigger, selected);
        this._closeColorMenus();
      });
      panel.appendChild(dot);
    });

    colorMenu.appendChild(trigger);
    colorMenu.appendChild(panel);

    return { colorMenu, trigger };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CREAR NOTA — orquesta los builders anteriores
  // ══════════════════════════════════════════════════════════════════════════

  createNote(content = "", color = null, id = this._newId(), rotation = null) {
    if (this._notes.length >= NoteManager.MAX_NOTES) {
      this._showStorageWarning();
      return null;
    }

    const colorName = this._colorName(color ?? this._randomColor());
    const rot       = parseFloat(rotation) || parseFloat(this._randomRotation());

    // Contenedor principal
    const note = document.createElement("div");
    note.classList.add("note");
    note.style.background = this._colorVar(colorName);
    note.dataset.color    = colorName;
    note.dataset.id       = id;
    note.dataset.rotation = rot;
    note.style.setProperty("--rotation", `${rot}deg`);
    note.setAttribute("role", "article");
    note.setAttribute("aria-label", "Nota adhesiva");

    // Piezas del DOM
    const removeButton        = this._buildThumbTack();
    const textArea            = this._buildTextArea(content);
    const lineCount           = document.createElement("span");
    lineCount.classList.add("char-count");
    const { colorMenu, trigger } = this._buildColorMenu(note, colorName);
    const picker              = this._buildColorPicker(note, trigger);

    // Vincular eliminar al botón de la chinche
    removeButton.addEventListener("click", (e) => {
      e.stopPropagation();
      this._removeNote(note);
    });

    this._makeDraggable(note);

    note.appendChild(removeButton);
    note.appendChild(textArea);
    note.appendChild(lineCount);
    note.appendChild(picker);
    note.appendChild(colorMenu);
    this.board.appendChild(note);
    this._notes.push(note);

    requestAnimationFrame(() => this._setupLineLimit(textArea, lineCount));
    this._updateCounter();
    return note;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // COLOR
  // ══════════════════════════════════════════════════════════════════════════

  _applyColor(note, trigger, name) {
    note.style.background    = this._colorVar(name);
    note.dataset.color       = name;
    trigger.style.background = this._colorVar(name);
    this.saveNotes();
  }

  _createColorButton(name, onSelect) {
    const button = document.createElement("button");
    button.classList.add("color-dot");
    button.style.background = this._colorVar(name);
    button.title = "Cambiar a este color";
    button.setAttribute("aria-label", `Color ${name}`);
    button.addEventListener("mousedown", (e) => e.stopPropagation());
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      onSelect(name);
    });
    return button;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ELIMINAR NOTA
  // ══════════════════════════════════════════════════════════════════════════

  _removeNote(note) {
    note.classList.add("removing");
    note.addEventListener("animationend", () => {
      note.remove();
      this._notes = this._notes.filter(n => n !== note);
      this.saveNotes();
      this._updateCounter();
    }, { once: true });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DRAG & DROP
  // ══════════════════════════════════════════════════════════════════════════

  _makeDraggable(note) {
    note.draggable = true;
    this._bindMouseDrag(note);
    this._bindTouchDrag(note);
  }

  /** Drag & Drop con mouse (desktop). */
  _bindMouseDrag(note) {
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
  }

  /** Drag & Drop con touch (móvil). */
  _bindTouchDrag(note) {
    let _touchMoved = false;

    note.addEventListener("touchstart", (e) => {
      if (e.target.closest(".input")) return;
      _touchMoved  = false;
      this._dragEl = note;
      note.style.animation = "none";
    }, { passive: true });

    note.addEventListener("touchmove", (e) => {
      if (!this._dragEl) return;
      _touchMoved = true;
      note.classList.add("dragging");

      const t = e.touches[0];
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

  // ══════════════════════════════════════════════════════════════════════════
  // GUARDAR / CARGAR
  // ══════════════════════════════════════════════════════════════════════════

  static get MAX_NOTES() { return 50; }
  static get MAX_STORAGE_BYTES() { return 4 * 1024 * 1024; }

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
    try {
      localStorage.setItem("sticky-notes", JSON.stringify(data));
    } catch (e) {
      if (e instanceof DOMException && (
        e.name === "QuotaExceededError" ||
        e.name === "NS_ERROR_DOM_QUOTA_REACHED"
      )) {
        this._showStorageWarning();
      }
    }
  }

  loadNotes() {
    const saved = localStorage.getItem("sticky-notes");
    if (!saved) return;
    if (saved.length > NoteManager.MAX_STORAGE_BYTES) {
      localStorage.removeItem("sticky-notes");
      return;
    }
    try {
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) throw new Error("formato inválido");
      parsed.slice(0, NoteManager.MAX_NOTES).forEach(n => {
        const content  = typeof n.content  === "string" ? n.content.slice(0, 10000) : "";
        const color    = typeof n.color    === "string" ? n.color                   : null;
        const id       = typeof n.id       === "string" ? n.id.slice(0, 64)         : this._newId();
        const rotation = isFinite(parseFloat(n.rotation)) ? n.rotation              : this._randomRotation();
        this.createNote(content, color, id, rotation);
      });
    } catch {
      localStorage.removeItem("sticky-notes");
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BORRAR TODO
  // ══════════════════════════════════════════════════════════════════════════

  clearAll() {
    localStorage.removeItem("sticky-notes");
    this._notes.forEach(n => {
      n.classList.add("removing");
      n.addEventListener("animationend", () => n.remove(), { once: true });
    });
    this._notes = [];
    setTimeout(() => this._updateCounter(), 300);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MODAL
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Abre el modal con mensaje y texto de confirmación configurables.
   * Elimina la necesidad de guardar/restaurar estado manualmente.
   */
  _openModal({
    message     = "¿Eliminar todas las notas?",
    confirmText = "Sí, eliminar",
    onConfirm   = null,
    hideCancel  = false,
  } = {}) {
    const { overlay, title, confirm, cancel } = this.modal;

    title.textContent   = message;
    confirm.textContent = confirmText;
    cancel.hidden       = hideCancel;

    this._modalAction      = onConfirm;
    this._modalReturnFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    overlay.hidden = false;
    confirm.focus();
  }

  _closeModal({ confirmed = false } = {}) {
    const { overlay, cancel } = this.modal;
    const action      = confirmed ? this._modalAction : null;
    const returnFocus = this._modalReturnFocus;

    overlay.hidden = true;
    cancel.hidden  = false;
    this._modalAction      = null;
    this._modalReturnFocus = null;

    if (action) action();
    if (returnFocus?.isConnected) returnFocus.focus();
  }

  _showStorageWarning() {
    this._openModal({
      message:     "No hay espacio para guardar. Eliminá algunas notas para continuar.",
      confirmText: "Entendido",
      hideCancel:  true,
    });
  }

  _trapModalFocus(e) {
    if (e.key !== "Tab") return;
    const { overlay } = this.modal;
    const focusable = [...overlay.querySelectorAll("button:not([hidden])")]
      .filter(el => !el.disabled && el.offsetParent !== null);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last  = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PANEL DE AYUDA (disclosure)
  // ══════════════════════════════════════════════════════════════════════════

  _setDisclosure(panel, trigger, open) {
    panel.hidden = !open;
    trigger.setAttribute("aria-expanded", String(open));
  }

  _closeDisclosure(panel, trigger) {
    this._setDisclosure(panel, trigger, false);
  }

  _bindDismissiblePanel({ panel, trigger, closeButton }) {
    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      this._setDisclosure(panel, trigger, panel.hidden);
    });
    closeButton?.addEventListener("click", () => this._closeDisclosure(panel, trigger));
    document.addEventListener("click", (e) => {
      if (!panel.hidden && !panel.contains(e.target) && !trigger.contains(e.target)) {
        this._closeDisclosure(panel, trigger);
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !panel.hidden) {
        this._closeDisclosure(panel, trigger);
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BINDINGS GLOBALES
  // ══════════════════════════════════════════════════════════════════════════

  _bindToolbar() {
    document.getElementById("create").addEventListener("click", () => {
      const note = this.createNote();
      if (!note) return;
      this.saveNotes();
      requestAnimationFrame(() => {
        note.scrollIntoView({ behavior: "smooth", block: "center" });
        note.querySelector(".input")?.focus();
      });
    });
  }

  _bindModal() {
    document.getElementById("clear-all").addEventListener("click", () => {
      if (this._notes.length === 0) return;
      this._openModal({ onConfirm: () => this.clearAll() });
    });
    this.modal.confirm.addEventListener("click", () => this._closeModal({ confirmed: true }));
    this.modal.cancel.addEventListener("click",  () => this._closeModal());
    this.modal.overlay.addEventListener("click", (e) => {
      if (e.target === this.modal.overlay) this._closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (this.modal.overlay.hidden) return;
      if (e.key === "Escape") { this._closeModal(); return; }
      this._trapModalFocus(e);
    });
  }

  _bindHelp() {
    const btn   = document.getElementById("help-btn");
    const panel = document.getElementById("help-panel");
    const close = document.getElementById("help-close");
    this._bindDismissiblePanel({ panel, trigger: btn, closeButton: close });
  }

  _closeColorMenus(except = null) {
    document.querySelectorAll(".color-menu.open").forEach(menu => {
      if (menu === except) return;
      menu.classList.remove("open");
      menu.querySelector(".color-menu-trigger")?.setAttribute("aria-expanded", "false");
    });
  }

  _bindColorMenus() {
    document.addEventListener("click",   (e) => {
      if (!e.target.closest(".color-menu")) this._closeColorMenus();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this._closeColorMenus();
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