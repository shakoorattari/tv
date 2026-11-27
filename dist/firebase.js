import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth,onAuthStateChanged,GoogleAuthProvider,signInWithCredential,signInWithPopup,signInWithEmailAndPassword,signOut} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {getFirestore,doc,onSnapshot,runTransaction} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const empty = {categories: [], videos: []};
const sharedKey = 'strand.shared.v1';
const personalKey = uid => 'strand.personal.v1.' + uid;

function cached(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

function cache(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch {}
}

function androidCredential(clientId) {
  const bridge = window.StrandGoogle;
  if (!bridge || !clientId) throw Error('Google sign-in on Android needs the updated app and Android sign-in setup.');
  return new Promise((resolve, reject) => {
    bridge.onmessage = event => {
      bridge.onmessage = null;
      const result = JSON.parse(event.data);
      if (result.token) resolve(GoogleAuthProvider.credential(result.token));
      else reject(Error(result.error));
    };
    bridge.postMessage(clientId);
  });
}

export function connect(config, seed, onChange) {
  const app = initializeApp(config), auth = getAuth(app), db = getFirestore(app);
  const shared = doc(db, 'library', 'current');
  const personal = uid => doc(db, 'users', uid, 'library', 'current');
  const state = {
    library: cached(sharedKey, seed), personal: empty, user: null, isAdmin: false,
    ready: false, cloudError: '', personalError: '',
  };
  const publish = () => onChange({...state});
  const save = (ref, fallback, mutate) => runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    const next = snap.exists() ? snap.data() : structuredClone(fallback);
    mutate(next);
    tx.set(ref, next);
  });
  let stopRole = () => {}, stopPersonal = () => {};

  onSnapshot(shared, {includeMetadataChanges: true}, snap => {
    if (snap.metadata.fromCache && !snap.exists()) return;
    state.library = snap.exists() ? snap.data() : seed;
    state.ready = true;
    state.cloudError = '';
    cache(sharedKey, state.library);
    publish();
  }, () => {
    state.cloudError = 'Shared library unavailable. Check connectivity and Firestore rules.';
    publish();
  });

  onAuthStateChanged(auth, user => {
    stopRole();
    stopPersonal();
    const uid = user?.uid;
    state.user = user;
    state.isAdmin = false;
    state.personal = uid ? cached(personalKey(uid), empty) : empty;
    state.personalError = '';
    publish();
    if (!uid) return;
    stopRole = onSnapshot(doc(db, 'admins', uid), snap => {
      if (auth.currentUser?.uid !== uid) return;
      state.isAdmin = snap.exists();
      publish();
    }, () => {});
    stopPersonal = onSnapshot(personal(uid), {includeMetadataChanges: true}, snap => {
      if (auth.currentUser?.uid !== uid || (snap.metadata.fromCache && !snap.exists())) return;
      state.personal = snap.exists() ? snap.data() : empty;
      cache(personalKey(uid), state.personal);
      state.personalError = '';
      publish();
    }, () => {
      if (auth.currentUser?.uid !== uid) return;
      state.personalError = 'Personal library sync is unavailable. Check connectivity and Firestore rules.';
      publish();
    });
  });

  return {
    login: (email, password) => signInWithEmailAndPassword(auth, email, password),
    async google(android) {
      if (android) return signInWithCredential(auth, await androidCredential(window.STRAND_GOOGLE_CLIENT_ID));
      return signInWithPopup(auth, new GoogleAuthProvider());
    },
    logout: () => signOut(auth),
    save: mutate => save(shared, seed, mutate),
    savePersonal(uid, mutate) {
      if (auth.currentUser?.uid !== uid) throw Error('Sign in to edit your personal library.');
      return save(personal(uid), empty, mutate);
    },
  };
}
