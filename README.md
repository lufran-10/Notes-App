# 📌 Sticky Notes

Una aplicación web de notas adhesivas digitales, construida con HTML, CSS y JavaScript vanilla. Permite crear, editar y eliminar notas sobre un tablero de corcho interactivo.

---

## 🖥️ Vista previa

Las notas se muestran sobre un fondo de tablero de corcho y se fijan con una chinche blanca. Cada nota tiene un color aleatorio y es completamente editable.

---

## ✨ Características

- ➕ **Crear notas** con un solo clic
- ✏️ **Editar notas** directamente en la pantalla (texto editable)
- 🗑️ **Eliminar notas** haciendo clic en la chinche
- 🎨 **Colores aleatorios** para cada nota (azul, rosa, verde, amarillo y violeta)
- 💾 **Persistencia automática** mediante `localStorage` — las notas se conservan al recargar la página
- 📱 **Diseño responsive** adaptado a distintos tamaños de pantalla

---

## 🗂️ Estructura del proyecto

```
sticky-notes/
├── index.html          # Estructura principal de la app
├── style.css           # Estilos y diseño visual
├── script.js           # Lógica de la aplicación
└── images/
    ├── cork-board.jpg  # Fondo del tablero de corcho
    └── white-thumbtack.png  # Ícono de chinche para eliminar notas
```

---

## 🚀 Cómo usar

1. Cloná o descargá el repositorio.
2. Abrí el archivo `index.html` en tu navegador.
3. ¡Listo! No requiere instalación ni dependencias externas.

```bash
git clone https://github.com/tu-usuario/sticky-notes.git
cd sticky-notes
# Abrí index.html en tu navegador
```

---

## 🛠️ Tecnologías utilizadas

| Tecnología | Uso |
|---|---|
| HTML5 | Estructura de la app |
| CSS3 | Estilos, animaciones y diseño responsive |
| JavaScript (ES6+) | Lógica, DOM y `localStorage` |
| [Font Awesome 6](https://fontawesome.com/) | Ícono del botón de crear |
| [Google Fonts – Caveat](https://fonts.google.com/specimen/Caveat) | Tipografía estilo manuscrito |

---

## 🎨 Colores disponibles

| Color | Hex |
|---|---|
| 🔵 Azul | `#b5e9ec` |
| 🩷 Rosa | `#fec3dd` |
| 🟢 Verde | `#bbe9ba` |
| 🟡 Amarillo | `#f9e558` |
| 🟣 Violeta | `#ccaafe` |

---

## 📋 Cómo funciona

1. Al hacer clic en el botón **`+`**, se genera una nueva nota con un color al azar.
2. Hacé clic dentro de la nota para editarla. Los cambios se guardan automáticamente.
3. Hacé clic en la **chinche blanca** en la parte superior de una nota para eliminarla.
4. Todas las notas se almacenan en `localStorage`, por lo que persisten entre sesiones.

---

## 📱 Responsive

La app se adapta a distintos tamaños de pantalla:

- **> 800px**: notas de 300×300 px
- **≤ 800px**: notas de 250×250 px
- **≤ 300px**: notas de 200×200 px

---

## 📄 Licencia

Este proyecto es de uso libre para fines educativos y personales.


## Futuros cambios:

- Sigo sin poder escribir ningún caracter. (volvi al ultimo script antes de este que rompio todo)