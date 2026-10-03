let notes = [
    { id: 1, text: "Buy mkate and maziwa", category: "personal"},
    { id: 2, text: "Finish assignment before deadline", category: "study"},
    { id: 3, text: "Email the project report to Grace", category: "work"},
    { id: 4, text: "Revise JavaScript arrays", category: "study" },
    { id: 5, text: "Call mum", category: "personal" },
];

// searchNotes
function searchNotes(word) {
    const searchTerm = word.toLowerCase();
    return notes.filter(note => note.text.toLowerCase().includes(searchTerm));
}