"use strict";

const API_URL = "https://jsonplaceholder.typicode.com/posts";
const loadButton = document.getElementById("load-btn");
const submitButton = document.getElementById("submit-btn");
const form = document.getElementById("note-form");
const titleInput = document.getElementById("title-input");
const bodyInput = document.getElementById("body-input");
const status = document.getElementById("status");
const list = document.getElementById("notes-list");
let notes = [];
let busy = false;

async function request(path = "", options = {}) {
  const response = await fetch(`${API_URL}${path}`, options);
  if (!response.ok) throw new Error(`Request failed (status ${response.status}).`);
  const data = response.status === 204 ? null : await response.json();
  return { data, status: response.status };
}

function showStatus(message, kind = "") {
  status.textContent = message;
  status.className = kind;
}

function setBusy(value) {
  busy = value;
  loadButton.disabled = value;
  submitButton.disabled = value;
  titleInput.disabled = value;
  bodyInput.disabled = value;
  list.setAttribute("aria-busy", String(value));
  list.querySelectorAll("button").forEach(button => { button.disabled = value; });
}

function renderNotes() {
  list.replaceChildren();
  if (notes.length === 0) {
    const item = document.createElement("li");
    item.className = "empty";
    item.textContent = "No notes yet. Write your first note above.";
    list.append(item);
    return;
  }
  for (const note of notes) {
    const item = document.createElement("li");
    item.className = "note";
    const heading = document.createElement("h3");
    heading.textContent = note.title;
    const body = document.createElement("p");
    body.textContent = note.body;
    item.append(heading, body);
    list.append(item);
  }
}

async function loadNotes() {
  if (busy) return;
  setBusy(true);
  showStatus("Loading notes...");
  try {
    const { data } = await request("?_limit=10");
    if (!Array.isArray(data)) throw new Error("The server returned an unexpected response.");
    notes = data;
    renderNotes();
    showStatus(notes.length ? `Loaded ${notes.length} notes from the server.` : "No notes found on the server.", "success");
  } catch (error) {
    showStatus(`Could not load notes. Check your connection and try again. ${error.message}`, "error");
  } finally {
    setBusy(false);
  }
}

loadButton.addEventListener("click", loadNotes);
async function createNote(event) {
  event.preventDefault();
  if (busy) return;
  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();
  if (!title || title.length > 100) {
    showStatus("Please enter a title between 1 and 100 characters.", "error");
    titleInput.focus();
    return;
  }
  setBusy(true);
  showStatus("Saving note...");
  try {
    const { data, status: code } = await request("", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ title, body, userId: 1 })
    });
    if (!data || data.id == null) throw new Error("The server did not return a note ID.");
    notes.unshift({ ...data, title, body });
    renderNotes();
    showStatus(`Note created (status ${code}, id ${data.id}).`, "success");
    form.reset();
  } catch (error) {
    showStatus(`Could not save your note. Please try again. ${error.message}`, "error");
  } finally {
    setBusy(false);
  }
}

form.addEventListener("submit", createNote);
