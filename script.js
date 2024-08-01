const createBtn = document.getElementById("create");
const colors = ["#b5e9ec", "#fec3dd", "#bbe9ba", "#f9e558", "#ccaafe"];
const container = document.querySelector(".container");

// Función para crear una nota
function createNote(
  content = "",
  color = colors[Math.floor(Math.random() * colors.length)]
) {
  let note = document.createElement("div");
  note.classList.add("note");
  note.style.background = color;
  let img = document.createElement("img");
  img.src = "./images/white-thumbtack.png";
  img.title = "Delete";
  let textArea = document.createElement("div");
  textArea.classList.add("input");
  textArea.contentEditable = "true";
  textArea.spellcheck = false;
  textArea.innerHTML = content;

  // Evento para guardar las notas cuando se editen
  textArea.addEventListener("input", saveNotes);

  note.appendChild(img);
  note.appendChild(textArea);
  container.appendChild(note);
}

// Guardar notas en localStorage
function saveNotes() {
  let notes = [];
  document.querySelectorAll(".note").forEach((note) => {
    notes.push({
      content: note.querySelector(".input").innerHTML,
      color: note.style.background,
    });
  });
  localStorage.setItem("notes", JSON.stringify(notes));
}

// Cargar notas desde localStorage
function loadNotes() {
  let savedNotes = localStorage.getItem("notes");
  if (savedNotes) {
    JSON.parse(savedNotes).forEach((note) => {
      createNote(note.content, note.color);
    });
  }
}

// Crear una nueva nota cuando se hace clic en el botón de crear
createBtn.addEventListener("click", () => {
  createNote();
  saveNotes();
});

// Eliminar una nota
container.addEventListener("click", function (e) {
  if (e.target.tagName === "IMG") {
    e.target.parentElement.remove();
    saveNotes();
  }
});

// Cargar notas al iniciar la página
loadNotes();
