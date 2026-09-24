"use client";
import { AiRobotFace } from "@/components/brand/ai-robot";
export function AskAboutMenu() {return <button type="button" className="button secondary" onClick={()=>window.dispatchEvent(new CustomEvent("aio:ask",{detail:"この商品の売れ方・利益の画面から、次に確認することを教えてください。"}))}><AiRobotFace className="message-avatar"/> この画面についてAIに相談</button>;}
