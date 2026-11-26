import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {getFirestore,doc,onSnapshot,runTransaction} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

export async function connect(config,seed,onChange){
 const app=initializeApp(config),auth=getAuth(app),db=getFirestore(app),ref=doc(db,'library','current');
 const state={library:seed,user:null,isAdmin:false,ready:false,cloudError:''};
 const publish=()=>onChange({...state});let stopRole=()=>{};
 onSnapshot(ref,snap=>{state.library=snap.exists()?snap.data():seed;state.ready=true;state.cloudError='';publish()},()=>{state.cloudError='Shared library unavailable. Check connectivity and Firestore rules.';publish()});
 onAuthStateChanged(auth,u=>{stopRole();state.user=u;state.isAdmin=false;publish();
 if(u)stopRole=onSnapshot(doc(db,'admins',u.uid),s=>{state.isAdmin=s.exists();publish()},()=>{state.isAdmin=false;publish()});});
 return {login:(email,password)=>signInWithEmailAndPassword(auth,email,password),logout:()=>signOut(auth),save:mutate=>runTransaction(db,async tx=>{const snap=await tx.get(ref);const next=snap.exists()?snap.data():structuredClone(seed);mutate(next);tx.set(ref,next)})};
}
