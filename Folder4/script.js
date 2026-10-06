const noteText = document.getElementById("note-text");
const charCount = document.getElementById("char-count");
const wordCount = document.getElementById("word-count");
const clearBtn = document.getElementById("clear-btn");
const themeToggle = document.getElementById("theme-toggle");

// Update characters and words counts, and handle warning/over classes
function updateCounts() {
  const text = noteText.value;
  const length = text.length;
  const words = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;

  charCount.textContent = `${length} / 200 characters`;
  wordCount.textContent = `${words} ${words === 1 ? "word" : "words"}`;

  // Reset counter styles
  charCount.classList.remove("warning", "over");

  // Apply warning (>180) or over (>200) classes
  if (length > 200) {
    charCount.classList.add("over");
  } else if (length > 180) {
    charCount.classList.add("warning");
  }
}

// Save draft and update counts on user input
noteText.addEventListener("input", () => {
  updateCounts();
  localStorage.setItem("note-draft", noteText.value);
});

// Clear textarea, localStorage, and update UI
function clearNote() {
  noteText.value = "";
  localStorage.removeItem("note-draft");
  updateCounts();
  noteText.focus();
}

// Clear button click listener
clearBtn.addEventListener("click", clearNote);

// Press Escape inside textarea to clear it
noteText.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    clearNote();
  }
});

// Theme toggle click listener
themeToggle.addEventListener("click", () => {
  document.body.classList.toggle("dark");
  const isDark = document.body.classList.contains("dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");
  themeToggle.textContent = isDark ? "Light mode" : "Dark mode";
});

// On page load: restore draft & theme, then calculate initial counts
window.addEventListener("DOMContentLoaded", () => {
  const savedDraft = localStorage.getItem("note-draft");
  if (savedDraft !== null) {
    noteText.value = savedDraft;
  }

  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "dark") {
    document.body.classList.add("dark");
    themeToggle.textContent = "Light mode";
  } else {
    themeToggle.textContent = "Dark mode";
  }

  updateCounts();
});
