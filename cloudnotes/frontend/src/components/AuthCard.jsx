import { useState } from "react";
import { supabase } from "../supabase"

const input =
  "mt-1 w-full rounded-lg border border-line bg-white px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-accent";
const primary =
  "w-full rounded-lg bg-accent px-4 py-3 font-semibold text-white hover:bg-accent-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60";
 
export default function AuthCard({recovery, onRecovered}){
    const[mode,setMode]=useState("login");      //login | SignUp | Forgote
    const[email,setEmail]=useState("");
    const[password,setPassword]=useState("");
    const[msg,setMsg]=useState(null);
    const[busy,setBusy]=useState(false);

    async function submit(e){
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        let error=null;

        if(recovery){
            ({error}=await supabase.auth.updateUser({password}));
            if(!error){
                setMsg({ok:true,text:"Password updated:"});
                onRecovered();
            }
        }
        else if (mode==="signup"){
            ({error}=await supabase.auth.signUp({email,password}));
            if(!error){
                setMsg({ok:true,text:"Account created. Check you email, Please log in"});
            }
            
        }
        else if(mode==="forgot"){
                ({error}=await supabase.auth.resetPasswordForEmail(email,{
                    redirectTo:window.location.origin
                }))
            if(!error){
                setMsg({ok:true,text:"If that email has an accout, a reset link has on its way"})
            }
        }
        else{
            ({error}=await supabase.auth.signInWithPassword({email,password}));
        }
        if(error){
            setMsg({ok:false,text:error.message});
        }
        setBusy(false)
        
    }
    const title = recovery ? "Set a new password"
    : mode === "signup" ? "Create your account"
    : mode === "forgot" ? "Reset your password"
    : "Log in";
  const button = recovery ? "Save password"
    : mode === "signup" ? "Sign up"
    : mode === "forgot" ? "Send reset link"
    : "Log in";

  return (
    <form onSubmit={submit} className="rounded-xl border border-line bg-white p-6">
      <h2 className="font-display text-2xl font-bold">{title}</h2>

      <div className="mt-5 space-y-4">
        {!recovery && (
          <label className="block text-sm font-medium">
            Email
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              autoComplete="email" className={input} />
          </label>
        )}
        {mode !== "forgot" && (
          <label className="block text-sm font-medium">
            {recovery ? "New password" : "Password"}
            <input type="password" required minLength={6} value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signup" || recovery ? "new-password" : "current-password"}
              className={input} />
          </label>
        )}
      </div>

      {msg && (
        <p role="status" className={`mt-4 text-sm ${msg.ok ? "text-green-800" : "text-red-700"}`}>{msg.text}</p>
      )}

      <button type="submit" disabled={busy} className={`${primary} mt-5`}>
        {busy ? "Please wait…" : button}
      </button>

      {!recovery && (
        <div className="mt-4 flex justify-between text-sm text-muted">
          {mode === "login" ? (
            <>
              <button type="button" onClick={() => { setMode("signup"); setMsg(null); }} className="underline-offset-4 hover:underline">
                Create an account
              </button>
              <button type="button" onClick={() => { setMode("forgot"); setMsg(null); }} className="underline-offset-4 hover:underline">
                Forgot password?
              </button>
            </>
          ) : (
            <button type="button" onClick={() => { setMode("login"); setMsg(null); }} className="underline-offset-4 hover:underline">
              Back to log in
            </button>
          )}
        </div>
      )}
    </form>
  );
}