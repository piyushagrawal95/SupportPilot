import { useState,useEffect } from "react";
import { supabase } from "./supabase";

export default function App(){
  const[session,setSession]=useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  async function signUp(){
    const {error}=await supabase.auth.signUp({email,password});
    setMsg(error?error.message:"Sign Up successful, Please login")
  }

  async function logIn(){
    const {error}=await supabase.auth.signInWithPassword({email,password});
    setMsg(error?error.message:"");
  }
  return (
    <div style={{ maxWidth: 400, margin: "60px auto", fontFamily: "sans-serif" }}>
      <h1>CloudNotes</h1>
      {session ? (
        <>
          <p>Logged in as <b>{session.user.email}</b></p>
          <button onClick={() => supabase.auth.signOut()}>Log out</button>
        </>
      ) : (
        <>
          <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} /><br /><br />
          <input type="password" placeholder="Password (min 6)" value={password} onChange={(e) => setPassword(e.target.value)} /><br /><br />
          <button onClick={signUp}>Sign up</button>{" "}
          <button onClick={logIn}>Log in</button>
          {msg && <p>{msg}</p>}
        </>
      )}
    </div>
  );
}