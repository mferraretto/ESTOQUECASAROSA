// firebase-config.js
// Config fornecido pelo usuário
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, addDoc, collection,
  query, where, getDocs, updateDoc, serverTimestamp, orderBy, limit,
  writeBatch, increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage, ref as sref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

export const firebaseConfig = {
  apiKey: "AIzaSyC78l9b2DTNj64y_0fbRKofNupO6NHDmeo",
  authDomain: "matheus-35023.firebaseapp.com",
  projectId: "matheus-35023",
  storageBucket: "matheus-35023.firebasestorage.app",
  messagingSenderId: "1011113149395",
  appId: "1:1011113149395:web:c1f449e0e974ca8ecb2526"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Helpers para outros módulos
export const F = {
  doc, getDoc, setDoc, addDoc, collection, query, where, getDocs, updateDoc,
  serverTimestamp, orderBy, limit, writeBatch, increment
};
export const S = { sref, uploadBytes, getDownloadURL };
