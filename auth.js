// auth.js
import { auth, db, F } from './firebase-config.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const msg = document.getElementById('authMsg');

loginForm.addEventListener('submit', async (e)=>{
  e.preventDefault();
  msg.textContent = 'Entrando...';
  try{
    const email = document.getElementById('loginEmail').value.trim();
    const pass = document.getElementById('loginPass').value;
    await signInWithEmailAndPassword(auth, email, pass);
    window.location.href = './app.html';
  }catch(err){
    msg.textContent = 'Erro ao entrar: ' + (err?.message || err);
  }
});

signupForm.addEventListener('submit', async (e)=>{
  e.preventDefault();
  msg.textContent = 'Criando conta...';
  try{
    const email = document.getElementById('signupEmail').value.trim();
    const pass = document.getElementById('signupPass').value;
    const nome = document.getElementById('signupName').value.trim() || email.split('@')[0];
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await F.setDoc(F.doc(db, 'usuarios', cred.user.uid), {
      nome, email, perfil: 'ADM', criadoEm: F.serverTimestamp()
    });
    window.location.href = './app.html';
  }catch(err){
    msg.textContent = 'Erro ao cadastrar: ' + (err?.message || err);
  }
});

onAuthStateChanged(auth, (user)=>{
  // se já estiver logado, redireciona
  if(user) window.location.href = './app.html';
});
