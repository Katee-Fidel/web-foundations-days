const loadBtn = document.getElementById("load-users");
const filterInput = document.getElementById("filter-input");
const statusP = document.getElementById("status");
const usersList = document.getElementById("users-list");

let allUsers = [];

// Render array of users safely using createElement and textContent
function renderUsers(users) {
  usersList.innerHTML = "";

  if (users.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No users match your filter.";
    li.style.fontStyle = "italic";
    li.style.color = "#7f8c8d";
    usersList.appendChild(li);
    return;
  }

  users.forEach(user => {
    const li = document.createElement("li");

    const nameH3 = document.createElement("h3");
    nameH3.textContent = user.name;

    const emailP = document.createElement("p");
    emailP.textContent = `Email: ${user.email}`;

    const cityP = document.createElement("p");
    cityP.textContent = `City: ${user.address.city}`;

    const companyP = document.createElement("p");
    companyP.textContent = `Company: ${user.company.name}`;

    li.appendChild(nameH3);
    li.appendChild(emailP);
    li.appendChild(cityP);
    li.appendChild(companyP);

    usersList.appendChild(li);
  });
}

// Fetch users with async/await, try/catch/finally, and response check
async function loadUsers() {
  loadBtn.disabled = true;
  statusP.textContent = "Loading users...";
  usersList.innerHTML = "";

  try {
    const response = await fetch("https://jsonplaceholder.typicode.com/users");
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    allUsers = await response.json();
    statusP.textContent = `Successfully loaded ${allUsers.length} users.`;
    renderUsers(allUsers);
  } catch (error) {
    statusP.textContent = `Failed to load users: ${error.message}`;
  } finally {
    loadBtn.disabled = false;
  }
}

loadBtn.addEventListener("click", loadUsers);

// Real-time filtering over the stored array without new requests
filterInput.addEventListener("input", () => {
  const query = filterInput.value.toLowerCase().trim();
  const filtered = allUsers.filter(user => user.name.toLowerCase().includes(query));
  renderUsers(filtered);
});