// ── NoteStore ─────────────────────────────────────────────────────────────────
// Responsabilidad única: persistencia y estado de las notas en localStorage.
class NoteStore {
  static get MAX_NOTES()         { return 50; }
  static get MAX_STORAGE_BYTES() { return 4 * 1024 * 1024; }
  static get MAX_CONTENT_LENGTH(){ return 500; }
  static get MAX_ID_LENGTH()     { return 64; }
  static get STORAGE_KEY()       { return "sticky-notes"; }

  load() {
    const saved = localStorage.getItem(NoteStore.STORAGE_KEY);
    if (!saved) return [];
    if (saved.length > NoteStore.MAX_STORAGE_BYTES) {
      localStorage.removeItem(NoteStore.STORAGE_KEY);
      return [];
    }
    try {
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) throw new Error("formato inválido");
      return parsed.slice(0, NoteStore.MAX_NOTES);
    } catch {
      localStorage.removeItem(NoteStore.STORAGE_KEY);
      return [];
    }
  }

  save(notes) {
    try {
      localStorage.setItem(NoteStore.STORAGE_KEY, JSON.stringify(notes));
      return true;
    } catch (e) {
      if (e instanceof DOMException && (
        e.name === "QuotaExceededError" ||
        e.name === "NS_ERROR_DOM_QUOTA_REACHED"
      )) return false;
      throw e;
    }
  }

  clear() {
    localStorage.removeItem(NoteStore.STORAGE_KEY);
  }
}

// ── NoteManager ───────────────────────────────────────────────────────────────
class NoteManager {
  // ── Constantes ───────────────────────────────────────────────────────────
  static get SAVE_DEBOUNCE_MS()  { return 400; }

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
    this._store  = new NoteStore();
    this._darkMQ = window.matchMedia("(prefers-color-scheme: dark)");
    this._dragEl = null;
    this._notes  = [];
    this._modalAction      = null;
    this._modalOnClose     = null;
    this._modalReturnFocus = null;

    this._bindToolbar();
    this._bindModal();
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
    return "yellow";
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
    const clamped = raw.slice(0, NoteStore.MAX_CONTENT_LENGTH);
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

  // Cambio 3: _showToast() simplificado.
  // Los estilos se movieron a la clase .toast en style.css;
  // aquí solo se asigna la clase y se gestiona el ciclo de vida del elemento.
  _showToast(message, duration = 2500) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = "slideDown 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  _stopPointerPropagation(element) {
    element.addEventListener("mousedown", (e) => e.stopPropagation());
    element.addEventListener("touchstart", (e) => e.stopPropagation(), { passive: true });
    return element;
  }

  _setElementHidden(element, hidden) {
    element.hidden = hidden;
    element.setAttribute("aria-hidden", String(hidden));
  }

  _insertNoteAtPosition(dragEl, target, x, y) {
    const rect   = target.getBoundingClientRect();
    const midX   = rect.left + rect.width  / 2;
    const midY   = rect.top  + rect.height / 2;
    const before = y < midY || (y === midY && x < midX);
    this.board.insertBefore(dragEl, before ? target : target.nextSibling);
    this._notes = [...this.board.querySelectorAll(".note")];
  }

  _setColorMenuState(colorMenu, trigger, panel, open) {
    colorMenu.classList.toggle("open", open);
    trigger.setAttribute("aria-expanded", String(open));
    this._setElementHidden(panel, !open);
  }

  _createButton({ classNames = [], title = "", ariaLabel = "", attributes = {}, listeners = [], stopPropagation = false } = {}) {
    const button = document.createElement("button");
    button.type = "button";
    if (classNames.length) button.classList.add(...classNames);
    if (title) button.title = title;
    if (ariaLabel) button.setAttribute("aria-label", ariaLabel);
    Object.entries(attributes).forEach(([name, value]) => button.setAttribute(name, value));
    listeners.forEach(({ event, handler, options }) => {
      button.addEventListener(event, handler, options);
    });
    if (stopPropagation) this._stopPointerPropagation(button);
    return button;
  }

  _createElement({ tag = "div", classNames = [], attributes = {}, listeners = [], children = [] } = {}) {
    const element = document.createElement(tag);
    if (classNames.length) element.classList.add(...classNames);
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
    listeners.forEach(({ event, handler, options }) => element.addEventListener(event, handler, options));
    children.forEach(child => element.appendChild(child));
    return element;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CONSTRUCCIÓN DEL DOM DE CADA NOTA
  // ══════════════════════════════════════════════════════════════════════════

  _buildThumbTack() {
    const button = this._createButton({
      classNames: ["thumbtack-button"],
      title: "Eliminar nota",
      ariaLabel: "Eliminar nota",
      stopPropagation: true,
    });

    const img = this._createElement({
      tag: "img",
      classNames: ["thumbtack"],
      attributes: {
        src: this._thumbtackSrc(),
        alt: "",
        draggable: "false",
        "aria-hidden": "true",
      },
    });
    button.appendChild(img);

    return button;
  }

  _buildDragHandle(note) {
    const handle = this._createButton({
      classNames: ["drag-handle"],
      title: "Arrastrar para mover nota",
      ariaLabel: "Mover nota",
      listeners: [
        { event: "keydown", handler: (e) => {
          if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
          e.preventDefault();
          this._moveNoteWithKeyboard(note, e.key);
        } },
      ],
    });
    return handle;
  }

  _buildTextArea(content) {
    const textArea = this._createElement({
      tag: "div",
      classNames: ["input"],
      attributes: {
        role: "textbox",
        "aria-label": "Contenido de la nota",
        "aria-multiline": "true",
      },
      listeners: [
        { event: "mousedown", handler: (e) => e.stopPropagation() },
        { event: "touchstart", handler: (e) => e.stopPropagation(), options: { passive: true } },
        { event: "input", handler: this._debounce(() => this.saveNotes(), NoteManager.SAVE_DEBOUNCE_MS) },
      ],
    });
    textArea.contentEditable = "true";
    textArea.spellcheck = false;

    textArea.addEventListener("beforeinput", (e) => {
      const currentLength = (textArea.innerText || "").length;
      if (currentLength >= NoteStore.MAX_CONTENT_LENGTH && e.data) {
        e.preventDefault();
        this._showToast("Límite de caracteres alcanzado (500).");
      }
    });

    textArea.innerText = this._sanitizeContent(content);
    return textArea;
  }

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

  _buildColorMenu(note, colorName) {
    const colorMenu = document.createElement("div");
    colorMenu.classList.add("color-menu");
    colorMenu.setAttribute("role", "group");
    colorMenu.setAttribute("aria-label", "Cambiar color de la nota");

    const panel = document.createElement("div");
    panel.classList.add("color-menu-panel");
    panel.setAttribute("role", "menu");
    panel.setAttribute("aria-hidden", "true");
    panel.hidden = true;

    const trigger = this._createButton({
      classNames: ["color-menu-trigger"],
      title: "Cambiar color",
      ariaLabel: "Cambiar color de la nota",
      attributes: {
        "aria-haspopup": "true",
        "aria-expanded": "false",
      },
      stopPropagation: true,
      listeners: [
        { event: "click", handler: (e) => {
          e.stopPropagation();
          const willOpen = !colorMenu.classList.contains("open");
          this._closeColorMenus(colorMenu);
          this._setColorMenuState(colorMenu, trigger, panel, willOpen);
          if (willOpen) panel.querySelector(".color-dot")?.focus();
        } },
        { event: "keydown", handler: (e) => {
          if (e.key !== "ArrowDown" && e.key !== "ArrowRight") return;
          e.preventDefault();
          if (!colorMenu.classList.contains("open")) {
            this._closeColorMenus(colorMenu);
            this._setColorMenuState(colorMenu, trigger, panel, true);
          }
          panel.querySelector(".color-dot")?.focus();
        } },
      ],
    });
    trigger.style.background = this._colorVar(colorName);


    this.colors.forEach(name => {
      const dot = this._createColorButton(name, selected => {
        this._applyColor(note, trigger, selected);
        this._closeColorMenus();
      });
      dot.setAttribute("role", "menuitem");
      panel.appendChild(dot);
    });

    colorMenu.appendChild(trigger);
    colorMenu.appendChild(panel);

    return { colorMenu, trigger };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CREAR NOTA
  // ══════════════════════════════════════════════════════════════════════════

  createNote(content = "", color = null, id = this._newId(), rotation = null) {
    if (this._notes.length >= NoteStore.MAX_NOTES) {
      this._showStorageWarning();
      return null;
    }

    const colorName = this._colorName(color ?? this._randomColor());
    const rot       = parseFloat(rotation) || parseFloat(this._randomRotation());

    const note = document.createElement("div");
    note.classList.add("note");
    note.style.background = this._colorVar(colorName);
    note.dataset.color    = colorName;
    note.dataset.id       = id;
    note.dataset.rotation = rot;
    note.style.setProperty("--rotation", `${rot}deg`);
    note.setAttribute("role", "article");
    note.setAttribute("aria-label", "Nota adhesiva");

    const removeButton           = this._buildThumbTack();
    const textArea               = this._buildTextArea(content);
    const { colorMenu, trigger } = this._buildColorMenu(note, colorName);
    const picker                 = this._buildColorPicker(note, trigger);
    const dragHandle             = this._buildDragHandle(note);

    removeButton.addEventListener("click", (e) => {
      e.stopPropagation();
      this._removeNote(note);
    });

    this._makeDraggable(note);

    note.appendChild(removeButton);
    note.appendChild(textArea);
    note.appendChild(picker);
    note.appendChild(colorMenu);
    note.appendChild(dragHandle);
    this.board.appendChild(note);
    this._notes.push(note);

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
    const button = this._createButton({
      classNames: ["color-dot"],
      title: "Cambiar a este color",
      ariaLabel: `Color ${name}`,
      stopPropagation: true,
      listeners: [
        { event: "click", handler: (e) => {
          e.stopPropagation();
          onSelect(name);
        } },
      ],
    });
    button.style.background = this._colorVar(name);
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

  _moveNoteWithKeyboard(note, key) {
    const index = this._notes.indexOf(note);
    if (index === -1) return;

    const backward = key === "ArrowUp" || key === "ArrowLeft";
    const targetIndex = backward ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= this._notes.length) return;

    const target = this._notes[targetIndex];
    if (backward) {
      this.board.insertBefore(note, target);
    } else {
      this.board.insertBefore(target, note);
    }

    this._notes = [...this.board.querySelectorAll(".note")];
    this.saveNotes();
    note.querySelector(".drag-handle")?.focus();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DRAG & DROP
  // ══════════════════════════════════════════════════════════════════════════

  _makeDraggable(note) {
    note.draggable = true;
    this._bindMouseDrag(note);
    this._bindTouchDrag(note);
  }

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
      this._insertNoteAtPosition(this._dragEl, note, e.clientX, e.clientY);
    });
  }

  _bindTouchDrag(note) {
    let _touchMoved = false;

    note.addEventListener("touchstart", (e) => {
      if (!e.target.closest(".drag-handle")) return;
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
        this._insertNoteAtPosition(note, target, t.clientX, t.clientY);
      }
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
    const ok = this._store.save(data);
    if (!ok) this._showStorageWarning();
  }

  loadNotes() {
    const entries = this._store.load();
    entries.forEach(n => {
      const content  = typeof n.content  === "string" ? n.content.slice(0, NoteStore.MAX_CONTENT_LENGTH) : "";
      const color    = typeof n.color    === "string" ? n.color                                          : null;
      const id       = typeof n.id       === "string" ? n.id.slice(0, NoteStore.MAX_ID_LENGTH)           : this._newId();
      const rotation = isFinite(parseFloat(n.rotation)) ? n.rotation                                     : this._randomRotation();
      this.createNote(content, color, id, rotation);
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BORRAR TODO
  // ══════════════════════════════════════════════════════════════════════════

  clearAll() {
    this._store.clear();
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
  // PANEL DE AYUDA
  // ══════════════════════════════════════════════════════════════════════════

  _setDisclosure(panel, trigger, open) {
    this._setElementHidden(panel, !open);
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
      const panel = menu.querySelector(".color-menu-panel");
      if (panel) this._setElementHidden(panel, true);
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
}

// ── Init ─────────────────────────────────────────────────────────────────────
const app = new NoteManager();