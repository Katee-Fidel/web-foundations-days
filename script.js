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

// LongestNote
function longestNote() {
    if (notes.length === 0)
        return null;
    return notes.reduce((longest, current) =>
    current.text.length > longest.text.length ? current : longest);
}

// countByCategory 
function countByCategory() {
    const counts = {};
    for (let note of notes) {
        counts[note.category] = (counts[note.category] || 0) + 1;
    }
    return counts;
}
// getSummary 
function getSummary() {
    if (notes.length === 0) return "0 notes.";
    const counts = countByCategory();
    const summaryEntries = Object.entries(counts)
        .map(([category, count]) => `${count} ${category}`)
        .join(", ");
        const noteWord = notes.length === 1 ? "note" : "notes";
        return `${notes.length} ${noteWord}: ${summaryEntries}.`;
}

// isDuplicate 
function isDuplicate(text) {
    const cleanText = text.trim().toLowerCase();
    return notes.some(note => note.text.trim().toLowerCase() === cleanText);
}

// addNote 
function addNote(text, category) {
    const validCategories = ["personal", "work", "study"];
    const trimmedText = text ? text.trim() : "";

    if(trimmedText.length < 1 || trimmedText.length > 200) {
        console.log('Failed to add note: Length must be between 1 and 200 characters.');
        return false;
    }
    if (isDuplicate(trimmedText)) {
    console.log(`Failed to add note: "${trimmedText}" already exists.`);
    return false;
  }
  if (!validCategories.includes(category)) {
    console.log(`Failed to add note: Invalid category "${category}".`);
    return false;
  }

  const newId = notes.length > 0 ? Math.max(...notes.map(n => n.id)) + 1 : 1;
  notes.push({id: newId, text: trimmedText, category});
  return true;
}

// Test searchNotes
console.log(searchNotes("study")); 
// Expected: [{ id: 2, text: "Finish the Day 3 assignment", category: "study" }, { id: 4, text: "Revise JavaScript arrays", category: "study" }]

console.log(searchNotes("xyz")); 
// Expected: []

// Test longestNote
console.log(longestNote()); 
// Expected: { id: 3, text: "Email the project report to Grace", category: "work" }

// Edge case test for longestNote with empty array
const backupNotes = notes;
notes = [];
console.log(longestNote()); 
// Expected: null
notes = backupNotes; // restore data

// Test countByCategory
console.log(countByCategory()); 
// Expected: { personal: 2, study: 2, work: 1 }

// Edge case test for countByCategory on empty dataset
notes = [];
console.log(countByCategory()); 
// Expected: {}
notes = backupNotes; // restore data

// Test getSummary
console.log(getSummary()); 
// Expected: "5 notes: 2 personal, 2 study, 1 work." (order may vary based on entry insertion)

// Edge case test for getSummary with empty dataset
notes = [];
console.log(getSummary()); 
// Expected: "0 notes."
notes = backupNotes; // restore data

// Test isDuplicate
console.log(isDuplicate("Call mum")); 
// Expected: true

console.log(isDuplicate("Buy a brand new car")); 
// Expected: false

// Test addNote
console.log(addNote("Prepare presentation slides", "work")); 
// Expected: true

console.log(addNote("Call mum", "personal"));


