// app.js
// This module contains the logic for the Budget Guru dashboard.  It manages
// incomes, goals, calculates savings suggestions and persists data locally
// and (optionally) to Cloud Firestore.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// ---- Firebase configuration ----
// Replace the placeholder values below with your Firebase project's
// configuration. You can find these values in your Firebase console.
// See the Firebase docs for more information on initializing Firebase for web.
// https://firebase.google.com/docs/web/setup
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

let db = null;
try {
  // Only initialize Firebase if the user has filled in their config
  if (firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY") {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
  }
} catch (err) {
  console.error("Error initializing Firebase:", err);
}

// ---- State management ----
let incomes = [];
let goals = [];

// Try to load existing data from localStorage
function loadLocalData() {
  const storedIncomes = localStorage.getItem("bg_incomes");
  const storedGoals = localStorage.getItem("bg_goals");
  incomes = storedIncomes ? JSON.parse(storedIncomes) : [];
  goals = storedGoals ? JSON.parse(storedGoals) : [];
}

function saveLocalData() {
  localStorage.setItem("bg_incomes", JSON.stringify(incomes));
  localStorage.setItem("bg_goals", JSON.stringify(goals));
}

// Load data from Firestore if available
async function loadFirestoreData() {
  if (!db) return;
  try {
    // incomes collection
    const incomesSnap = await getDocs(collection(db, "incomes"));
    incomes = incomesSnap.docs.map((doc) => doc.data());
    // goals collection
    const goalsSnap = await getDocs(collection(db, "goals"));
    goals = goalsSnap.docs.map((doc) => doc.data());
    saveLocalData();
  } catch (err) {
    console.error("Failed to load data from Firestore", err);
  }
}

// DOM elements
const incomeForm = document.getElementById("income-form");
const incomeList = document.getElementById("income-list");
const goalForm = document.getElementById("goal-form");
const goalList = document.getElementById("goal-list");
const suggestionsDiv = document.getElementById("suggestions");
const summaryP = document.getElementById("summary");

// Render functions
function renderIncomes() {
  incomeList.innerHTML = "";
  incomes.forEach((income, index) => {
    const li = document.createElement("li");
    li.className =
      "flex justify-between items-center bg-gray-100 rounded-md px-3 py-2";
    li.innerHTML = `<span>₹${income.amount.toFixed(2)} on ${income.date}</span><button class="text-red-500 hover:text-red-700" data-index="${index}">x</button>`;
    incomeList.appendChild(li);
  });
}

function renderGoals() {
  goalList.innerHTML = "";
  goals.forEach((goal, index) => {
    const li = document.createElement("li");
    li.className =
      "flex justify-between items-center bg-gray-100 rounded-md px-3 py-2";
    li.innerHTML = `<span>${goal.name} – ₹${goal.amount.toFixed(2)}</span><button class="text-red-500 hover:text-red-700" data-index="${index}">x</button>`;
    goalList.appendChild(li);
  });
}

function updateSummary() {
  const totalIncome = incomes.reduce((sum, i) => sum + i.amount, 0);
  const totalGoals = goals.reduce((sum, g) => sum + g.amount, 0);
  if (!incomes.length && !goals.length) {
    summaryP.textContent = "No data yet.";
    return;
  }
  summaryP.textContent = `Total received: ₹${totalIncome.toFixed(2)} | Total goal targets: ₹${totalGoals.toFixed(2)}`;
}

function updateSuggestions() {
  suggestionsDiv.innerHTML = "";
  if (!incomes.length || !goals.length) {
    suggestionsDiv.innerHTML = `<p class="text-gray-500">Add some payments and goals to receive personalized suggestions.</p>`;
    return;
  }
  const lastIncome = incomes[incomes.length - 1];
  const totalGoalAmount = goals.reduce((sum, g) => sum + g.amount, 0);

  /*
   * Distribute the last payment across all goals proportionally, but do not
   * recommend saving more than what is still needed for each goal. We
   * calculate how much of each goal has effectively been "allocated" from
   * previous payments based on the same ratio, then cap the recommended
   * amount accordingly. Once a goal has been fully funded, the
   * recommendation will reflect that the goal is achieved.
   */
  goals.forEach((goal) => {
    // Determine this goal's share of the total target
    const ratio = totalGoalAmount > 0 ? goal.amount / totalGoalAmount : 0;
    // Sum contributions from all incomes except the last one, but cap each contribution
    // so that we never allocate more than needed for this goal. Without capping, large
    // early incomes could "over-fund" the goal before considering subsequent goals, which
    // leads to incorrect suggestion text like "Goal achieved" when there is still
    // remaining amount needed. To fix this, accumulate contributions by iterating
    // through previous incomes and adding the lesser of the calculated share and
    // the remaining requirement for this goal.
    const contributionsFromPrevious = incomes
      .slice(0, incomes.length - 1)
      .reduce((sum, inc) => {
        const potential = inc.amount * ratio;
        const remainingForThisGoal = goal.amount - sum;
        const actual = Math.min(potential, remainingForThisGoal);
        return sum + actual;
      }, 0);
    // Compute how much is left to save for this goal
    const remaining = goal.amount - contributionsFromPrevious;
    // Calculate the suggested amount from the last payment; cap it by remaining
    let recommended = 0;
    if (remaining > 0) {
      recommended = Math.min(lastIncome.amount * ratio, remaining);
    }
    const recommendation = document.createElement("div");
    recommendation.className = "p-3 bg-gray-100 rounded-md";
    if (remaining <= 0) {
      recommendation.innerHTML = `<strong>${goal.name}:</strong> Goal achieved!`; 
    } else {
      recommendation.innerHTML = `<strong>${goal.name}:</strong> save ₹${recommended.toFixed(2)} from your last payment`;
    }
    suggestionsDiv.appendChild(recommendation);
  });
  // Add a general tip
  const tip = document.createElement("p");
  tip.className = "text-sm text-gray-500 pt-4";
  tip.textContent = "Tip: consider setting aside at least 10% of every payment for an emergency fund.";
  suggestionsDiv.appendChild(tip);
}

// Event handlers
incomeForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const amountInput = document.getElementById("income-amount");
  const dateInput = document.getElementById("income-date");
  const amount = parseFloat(amountInput.value);
  const date = dateInput.value;
  if (isNaN(amount) || !date) return;
  const income = { amount, date };
  incomes.push(income);
  saveLocalData();
  renderIncomes();
  updateSummary();
  updateSuggestions();
  // Save to Firestore
  if (db) {
    try {
      await addDoc(collection(db, "incomes"), income);
    } catch (err) {
      console.error("Failed to add income to Firestore", err);
    }
  }
  incomeForm.reset();
});

incomeList.addEventListener("click", async (e) => {
  if (e.target.tagName !== "BUTTON") return;
  const index = parseInt(e.target.getAttribute("data-index"));
  if (isNaN(index)) return;
  incomes.splice(index, 1);
  saveLocalData();
  renderIncomes();
  updateSummary();
  updateSuggestions();
  // Note: deletion in Firestore is not implemented here for simplicity.
});

goalForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const nameInput = document.getElementById("goal-name");
  const amountInput = document.getElementById("goal-amount");
  const name = nameInput.value.trim();
  const amount = parseFloat(amountInput.value);
  if (!name || isNaN(amount)) return;
  const goal = { name, amount };
  goals.push(goal);
  saveLocalData();
  renderGoals();
  updateSummary();
  updateSuggestions();
  if (db) {
    try {
      await addDoc(collection(db, "goals"), goal);
    } catch (err) {
      console.error("Failed to add goal to Firestore", err);
    }
  }
  goalForm.reset();
});

goalList.addEventListener("click", (e) => {
  if (e.target.tagName !== "BUTTON") return;
  const index = parseInt(e.target.getAttribute("data-index"));
  if (isNaN(index)) return;
  goals.splice(index, 1);
  saveLocalData();
  renderGoals();
  updateSummary();
  updateSuggestions();
  // Deletion in Firestore is omitted for simplicity.
});

// Initial load
loadLocalData();
renderIncomes();
renderGoals();
updateSummary();
updateSuggestions();
// Optionally load from Firestore (overwrites local if available)
loadFirestoreData();