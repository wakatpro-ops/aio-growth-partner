import "server-only";
import OpenAI from "openai";
import { buildPrompt, getPromptTemplate } from "@/lib/openai/templates";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AiLogRecord, AiTemplateKey, Store } from "@/types/domain";

function demoOutput(templateKey: AiTemplateKey, store: Store) {
  if (templateKey === "post_generation") {
    return {
      post: `${store.name}からのお知らせです。地域の皆さまに安心してご利用いただけるよう、わかりやすい情報発信を続けています。気になることがあればお気軽にご相談ください。`,
      short_post: `${store.name}へのご相談をお待ちしています。`,
      hashtags: ["#地域店舗", "#AIOGrowthPartner", "#相談歓迎"]
    };
  }

  if (templateKey === "review_reply") {
    return {
      reply: `このたびは${store.name}へ温かいお言葉をいただき、誠にありがとうございます。今後も安心してご利用いただけるよう、丁寧な対応を心がけてまいります。`
    };
  }

  if (templateKey === "instagram_draft_generation" || templateKey === "google_business_profile_draft") {
    const isAuto = store.industry_type_key === "auto_repair";
    const channel = templateKey === "instagram_draft_generation" ? "Instagram" : "Googleビジネスプロフィール";
    return {
      title: isAuto ? "安心点検のご案内" : "今月のおすすめ",
      caption: isAuto
        ? `${store.name}では、季節の変わり目に合わせた点検と部品交換のご相談を受け付けています。安全なカーライフのため、気になる症状は早めにご相談ください。`
        : `${store.name}から今月のおすすめをご紹介します。商品やサービスの魅力を分かりやすくお届けしますので、ぜひお気軽にご来店ください。`,
      short_caption: isAuto ? "点検・整備のご相談はお気軽にどうぞ。" : "今月のおすすめをぜひご覧ください。",
      hashtags: isAuto ? ["#自動車整備", "#点検", "#安全運転", "#地域密着"] : ["#地域店舗", "#おすすめ", "#来店歓迎"],
      call_to_action: isAuto ? "点検予約・修理相談はこちら" : "ご来店・お問い合わせをお待ちしています",
      recommended_image_idea: isAuto ? "整備中の手元、交換部品、点検風景" : "商品、店内、スタッフの自然な写真",
      ai_reasoning: `${channel}向けに、店舗データと月次の状況から来店・予約につながりやすいテーマを選びました。`
    };
  }

  if (templateKey === "ai_monthly_recommendations") {
    const isAuto = store.industry_type_key === "auto_repair";
    return {
      title: isAuto ? "整備工場向け 月次集客改善提案" : "店舗向け 月次集客改善提案",
      good_points: ["請求・見積データが蓄積され、投稿テーマに活用できます。"],
      cautions: isAuto ? ["在庫注意部品と点検需要を定期的に確認してください。"] : ["売れ筋商品と在庫状況を定期的に確認してください。"],
      next_actions: isAuto ? ["点検予約につながる投稿を週1回作成する", "在庫注意部品を確認する"] : ["おすすめ商品投稿を作成する", "口コミ促進の導線を整える"],
      posting_themes: isAuto ? ["季節点検", "部品交換", "安全運転"] : ["おすすめ商品", "サービス紹介", "口コミ紹介"],
      inventory_suggestions: isAuto ? ["発注点に近い部品を投稿テーマと合わせて確認する"] : ["在庫の多い商品を販促テーマにする"],
      customer_priorities: ["直近の見積・請求につながる顧客へのフォローを優先する"],
      ai_reasoning: "月次レポート、在庫、顧客、見積・請求データから、次月に実行しやすい施策を整理しました。"
    };
  }

  if (templateKey === "sales_ai_monthly_report") {
    const isAuto = store.industry_type_key === "auto_repair";
    return {
      title: isAuto ? "整備工場向け 月次売上AIレポート" : "月次売上AIレポート",
      good_points: isAuto ? ["売上データから整備メニュー別の傾向を確認できる状態です。"] : ["売上データから商品・サービス別の傾向を確認できる状態です。"],
      cautions: isAuto ? ["オイル交換、タイヤ交換、車検、点検の増減と部品在庫を合わせて確認してください。"] : ["売上が落ちている商品と在庫状況を合わせて確認してください。"],
      growth_items: isAuto ? ["点検", "オイル交換", "タイヤ交換"] : ["売上上位の商品・サービス"],
      promotion_ideas: isAuto ? ["季節点検の案内", "安全運転につながる部品交換の紹介"] : ["売れ筋商品の紹介", "来店促進キャンペーン"],
      inventory_notes: isAuto ? ["伸びている整備メニューに関連する部品在庫を確認する"] : ["売れている商品の欠品を防ぐ"],
      next_actions: isAuto ? ["リピート来店向けの点検案内を作る", "部品在庫と売上上位メニューを照合する"] : ["売上上位商品を投稿する", "落ち込み商品の販促を見直す"],
      industry_advice: isAuto ? ["整備工場では、点検・車検・部品交換を分かりやすく伝えると予約につながりやすくなります。"] : ["店舗では、売れ筋と来店理由を投稿・POP・口コミ導線に展開すると効果的です。"],
      ai_reasoning: "対象月の売上集計、ランキング、注意点から、店舗オーナーが次に動きやすい内容に整理しました。"
    };
  }

  if (templateKey === "demand_action_recommendations") {
    const isAuto = store.industry_type_key === "auto_repair";
    return {
      actions: [
        {
          action_type: "instagram",
          title: isAuto ? "季節点検のInstagram投稿" : "おすすめ商品のInstagram投稿",
          body: isAuto ? "点検、オイル交換、タイヤ交換など、来月の相談につながりやすい整備テーマを写真付きで紹介します。" : "来月伸びそうな商品・サービスを、来店理由が伝わる写真と短い文章で紹介します。",
          item_name: null,
          priority: "high",
          reason: "需要予測で伸びる可能性があるテーマを早めに露出するためです。"
        },
        {
          action_type: "google_business_profile",
          title: isAuto ? "車検前点検のGoogle投稿" : "サービス紹介のGoogle投稿",
          body: isAuto ? "地域名、車検、点検、予約導線を自然に含めた投稿で検索経由の相談を狙います。" : "検索されやすい商品名やサービス名を含め、問い合わせにつながる投稿を作ります。",
          item_name: null,
          priority: "medium",
          reason: "Google検索からの流入を増やすためです。"
        },
        {
          action_type: "store_pop",
          title: isAuto ? "点検おすすめPOP" : "おすすめPOP",
          body: isAuto ? "安全運転のため、気になる症状は早めに点検を。" : "今月のおすすめ。気になる方はスタッフまで。",
          item_name: null,
          priority: "medium",
          reason: "店頭での気づきを作り、相談につなげるためです。"
        },
        {
          action_type: "customer_message",
          title: isAuto ? "リピート来店向け案内" : "既存顧客向け案内",
          body: isAuto ? "前回整備から時間が経ったお客様へ、点検や部品交換の案内を送ります。" : "過去に購入・利用したお客様へ、関連商品やサービスを案内します。",
          item_name: null,
          priority: "medium",
          reason: "既存顧客の再来店につなげるためです。"
        }
      ]
    };
  }

  if (templateKey === "growth_action_draft_generation") {
    const isAuto = store.industry_type_key === "auto_repair";
    const subject = isAuto ? "季節点検と車検前点検" : "今月のおすすめ商品・サービス";
    return {
      actions: [
        {
          target_channel: "google_business_profile",
          title: isAuto ? "Google投稿: 車検前点検の案内" : "Google投稿: おすすめサービス紹介",
          summary: isAuto ? "検索経由で点検・車検相談につなげる投稿です。" : "検索経由で来店・問い合わせにつなげる投稿です。",
          priority: "high",
          reason: isAuto ? "車検、点検、オイル交換など検索されやすい整備語句を自然に使えるためです。" : "来店理由になる商品・サービスをGoogle上で見せられるためです。",
          recommended_date: new Date().toISOString().slice(0, 10),
          draft: {
            title: isAuto ? "車検前点検・季節点検のご相談受付中" : "今月のおすすめサービス",
            body: isAuto ? `${store.name}では、車検前点検、オイル交換、タイヤ交換など安全運転につながる整備相談を受け付けています。気になる音や違和感がある方は、早めの点検がおすすめです。ご予約・ご相談はお気軽にどうぞ。` : `${store.name}では、今月おすすめの商品・サービスをご用意しています。気になる方はお気軽にお問い合わせください。`,
            short_body: isAuto ? "車検前点検・季節点検のご相談受付中です。" : "今月のおすすめをご紹介しています。",
            hashtags: [],
            call_to_action: isAuto ? "点検予約・整備相談はこちら" : "お問い合わせ・ご来店をお待ちしています"
          }
        },
        {
          target_channel: "instagram",
          title: isAuto ? "Instagram投稿: 点検の重要性" : "Instagram投稿: おすすめ紹介",
          summary: "写真と短い説明で認知を作る投稿です。",
          priority: "high",
          reason: "視覚的に伝えることで相談前の不安を減らせるためです。",
          recommended_date: new Date().toISOString().slice(0, 10),
          draft: {
            title: isAuto ? "安心点検のすすめ" : "今月のおすすめ",
            body: isAuto ? "安全なカーライフのために、季節の変わり目は点検がおすすめです。オイル交換、タイヤの状態、ブレーキまわりなど、気になることは早めにご相談ください。" : "今月のおすすめを紹介します。気になる方はぜひチェックしてください。",
            short_body: isAuto ? "季節点検で安心のカーライフを。" : "今月のおすすめです。",
            hashtags: isAuto ? ["#自動車整備", "#点検", "#オイル交換", "#タイヤ交換", "#車検"] : ["#おすすめ", "#地域店舗", "#来店歓迎"],
            call_to_action: isAuto ? "点検予約はお気軽に" : "ご来店をお待ちしています"
          }
        },
        {
          target_channel: "review_reply",
          title: "クチコミ返信案",
          summary: "信頼感を高める返信の下書きです。",
          priority: "medium",
          reason: "丁寧な返信が次の問い合わせの安心材料になるためです。",
          recommended_date: new Date().toISOString().slice(0, 10),
          draft: {
            title: "クチコミ返信テンプレート",
            body: isAuto ? `${store.name}をご利用いただきありがとうございます。整備内容や説明について安心していただけたようで大変うれしく思います。今後も点検、車検、修理の際は分かりやすく丁寧な対応を心がけてまいります。` : `${store.name}をご利用いただきありがとうございます。温かいお言葉を励みに、今後も丁寧な対応を続けてまいります。`,
            short_body: null,
            hashtags: [],
            call_to_action: null
          }
        },
        {
          target_channel: "customer_message",
          title: isAuto ? "既存顧客案内: 点検リマインド" : "既存顧客案内",
          summary: "再来店を促す案内文です。",
          priority: "medium",
          reason: "過去利用者へ次の相談きっかけを作れるためです。",
          recommended_date: new Date().toISOString().slice(0, 10),
          draft: {
            title: isAuto ? "点検時期のご案内" : "おすすめのご案内",
            body: isAuto ? `いつも${store.name}をご利用いただきありがとうございます。前回の整備からお時間が経っている場合、オイル交換やタイヤ状態の確認がおすすめです。気になる点がありましたらお気軽にご相談ください。` : `いつも${store.name}をご利用いただきありがとうございます。今月のおすすめをご案内しています。気になる点があればお気軽にご相談ください。`,
            short_body: isAuto ? "点検・オイル交換の時期確認はいかがですか。" : "今月のおすすめをご案内します。",
            hashtags: [],
            call_to_action: isAuto ? "点検予約はこちら" : "お問い合わせはこちら"
          }
        },
        {
          target_channel: "store_pop",
          title: isAuto ? "店頭POP: 早めの点検" : "店頭POP",
          summary: "店頭で相談を生む短いコピーです。",
          priority: "medium",
          reason: "来店中のお客様に追加相談のきっかけを作れるためです。",
          recommended_date: new Date().toISOString().slice(0, 10),
          draft: {
            title: isAuto ? "早めの点検で安心運転" : "今月のおすすめ",
            body: isAuto ? "気になる音・違和感、そのままにしていませんか？早めの点検で安心運転。" : "気になる方はスタッフまでお気軽にどうぞ。",
            short_body: isAuto ? "早めの点検で安心運転。" : "スタッフまでお気軽に。",
            hashtags: [],
            call_to_action: "スタッフまでお声がけください"
          }
        },
        {
          target_channel: "line",
          title: isAuto ? "LINE配信: 季節点検案内" : "LINE配信",
          summary: "短く読みやすい配信用文章です。",
          priority: "medium",
          reason: "既存顧客に直接届き、予約導線を作りやすいためです。",
          recommended_date: new Date().toISOString().slice(0, 10),
          draft: {
            title: isAuto ? "季節点検のお知らせ" : "今月のお知らせ",
            body: isAuto ? `【${store.name}】季節の変わり目は、オイル交換・タイヤ点検・車検前点検がおすすめです。気になる症状がある方は、お早めにご相談ください。` : `【${store.name}】今月のおすすめをご案内しています。気になる方はお気軽にお問い合わせください。`,
            short_body: `${subject}のご案内です。`,
            hashtags: [],
            call_to_action: isAuto ? "予約・相談はこちら" : "詳しくはこちら"
          }
        }
      ]
    };
  }

  return {
    score: 78,
    summary: `${store.name}は基本情報が整理されています。AI検索に向けて、地域名、強み、具体的なサービス説明をさらに明確にすると効果的です。`,
    strengths: ["店舗情報が分かりやすい", "業態に合う説明がある"],
    issues: ["具体的な来店理由を増やせる", "地域キーワードを補強できる"],
    recommendations: ["プロフィールに地域名を含める", "よくある相談内容を追加する", "クチコミ返信の一貫性を高める"]
  };
}

export async function generateWithAi(params: {
  store: Store;
  templateKey: AiTemplateKey;
  input: Record<string, unknown>;
  userId?: string | null;
}) {
  const template = await getPromptTemplate(params.store.industry_type_key, params.templateKey);
  const prompt = buildPrompt(template, params.store, params.input);
  const model = template.model;
  const supabase = createSupabaseAdminClient();

  let output: Record<string, unknown> | string | null = null;
  let tokens: Record<string, unknown> | null = null;
  let status: AiLogRecord["status"] = "success";
  let errorMessage: string | null = null;

  try {
    if (!process.env.OPENAI_API_KEY) {
      output = demoOutput(params.templateKey, params.store);
    } else {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await client.chat.completions.create({
        model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: template.systemPrompt },
          { role: "user", content: prompt }
        ]
      });

      const content = response.choices[0]?.message?.content ?? "{}";
      output = JSON.parse(content) as Record<string, unknown>;
      tokens = response.usage ? { ...response.usage } : null;
    }
  } catch (error) {
    status = "error";
    errorMessage = error instanceof Error ? error.message : "Unknown OpenAI error";
    output = null;
  }

  const logRecord: AiLogRecord = {
    user_id: params.userId ?? null,
    organization_id: params.store.organization_id,
    store_id: params.store.id,
    template_id: template.id,
    input: params.input,
    output,
    model,
    tokens,
    status,
    error_message: errorMessage
  };

  if (supabase) {
    await supabase.from("ai_generation_logs").insert(logRecord);
  }

  return { output, log: logRecord };
}
