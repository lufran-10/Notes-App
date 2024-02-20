const createBtn = document.getElementById("create");
const notesContainer = document.querySelector(".notes");
const colors = ["#b5e9ec", "#fec3dd", "#bbe9ba", "#f9e558", "#ccaafe"];
let notes = document.querySelectorAll(".note");

function showNotes() {
  notesContainer.innerHTML = sessionStorage.getItem("notes");
}
showNotes();

function updateStorage() {
  sessionStorage.setItem("notes", notesContainer.innerHTML);
}

createBtn.addEventListener("click", () => {
  let note = document.createElement("div");
  note.classList.add("note");
  note.style.background = colors[Math.floor(Math.random() * colors.length)];
  let img = document.createElement("img");
  img.src = "./images/white-thumbtack.png";
  img.title = "Delete";
  let textArea = document.createElement("div");
  textArea.classList.add("input");
  textArea.contentEditable = "true";
  textArea.spellcheck = "false";
  note.appendChild(img);
  note.appendChild(textArea);
  notesContainer.appendChild(note);
});

notesContainer.addEventListener("click", function (e) {
  if (e.target.tagName === "IMG") {
    e.target.parentElement.remove();
    updateStorage();
  } else {
    notes = document.querySelectorAll(".note");
    notes.forEach((note) => {
      note.onkeyup = function () {
        updateStorage();
      };
    });
  }
});
