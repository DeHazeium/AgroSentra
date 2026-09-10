import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";

import {
  getDatabase
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCi3i0NPY5638CiA4Iso23lCL07gqfWOg0",
  authDomain: "agrosentra-bbc11.firebaseapp.com",
  databaseURL: "https://agrosentra-bbc11-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "agrosentra-bbc11",
  storageBucket: "agrosentra-bbc11.firebasestorage.app",
  messagingSenderId: "941824964912",
  appId: "1:941824964912:web:a565d55223ca15d5ca70f5"
};

const app = initializeApp(firebaseConfig);

export const database = getDatabase(app);
