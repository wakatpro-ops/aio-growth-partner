'use client';
import { useEffect, useState } from 'react';
import { PendingSubmitButton } from '@/components/ui/pending-submit-button';
import { opaque } from '@/lib/procurement/model';

export function SupplierLogin({login,request}:{login:(form:FormData)=>Promise<void>;request:(form:FormData)=>Promise<void>}) {
  const [code,setCode]=useState('');
  useEffect(()=>{
    const raw=new URLSearchParams(window.location.hash.slice(1)).get('code');
    if(opaque(raw)) setCode(raw);
    if(window.location.hash) window.history.replaceState(window.history.state,'',window.location.pathname+window.location.search);
  },[]);
  return code ? <form action={login} className="form"><input type="hidden" name="code" value={code}/><p>招待された仕入先としてログインします。</p><PendingSubmitButton pendingLabel="確認しています…">仕入先画面にログイン</PendingSubmitButton></form>
    : <form action={request} className="form"><label>招待を受けたメールアドレス<input name="email" type="email" autoComplete="email" maxLength={254} required/></label><PendingSubmitButton pendingLabel="リクエスト中…">ログインリンクを受け取る</PendingSubmitButton></form>;
}
