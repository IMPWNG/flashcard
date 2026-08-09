// app/api/generate-idiom/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    console.log("🚀 Idiom API called");

    const MAMMOUTH_API_KEY = process.env.MAMMOUTH_API_KEY;
    if (!MAMMOUTH_API_KEY) {
      console.error("❌ MAMMOUTH_API_KEY is missing");
      return NextResponse.json(
        { error: "API Key not configured" },
        { status: 500 },
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: existingIdiom, error: queryError } = await supabase
      .from("idioms")
      .select("chinese")
      .gte("created_at", today.toISOString())
      .limit(1);

    if (queryError) {
      console.error("❌ Query error:", queryError);
      return NextResponse.json(
        { error: "Database error", details: queryError.message },
        { status: 500 },
      );
    }

    if (existingIdiom && existingIdiom.length > 0) {
      console.log("✅ Idiom already exists today");
      const { data: fullIdiom } = await supabase
        .from("idioms")
        .select("*")
        .gte("created_at", today.toISOString())
        .limit(1)
        .single();
      return NextResponse.json(
        { idiom: fullIdiom, message: "Idiom already generated today" },
        { status: 200 },
      );
    }

    const { data: allIdioms, error: allError } = await supabase
      .from("idioms")
      .select("chinese")
      .order("created_at", { ascending: false })
      .limit(50);

    if (allError) {
      console.error("❌ Error fetching existing idioms:", allError);
    }

    const existingChinese = allIdioms?.map((i) => i.chinese) || [];
    const existingList = existingChinese.slice(0, 20).join(", ");

    console.log("📡 Calling Mammouth API for idiom...");

    const aiResponse = await fetch(
      "https://api.mammouth.ai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${MAMMOUTH_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4.1-nano",
          messages: [
            {
              role: "system",
              content: `Tu es un expert en idiomes classiques chinois (成语). Tu dois générer des idiomes authentiques et bien documentés. Tu expliques TOUJOURS en français clair et précis. Tu respectes STRICTEMENT le format JSON demandé.`,
            },
            {
              role: "user",
              content: `Génère UN seul idiome chinois classique (成语) qui n'est PAS dans cette liste: ${existingList || "aucun"}

Sélectionne parmi des vrais idiomes authentiques comme: 卧虎藏龙, 厚积薄发, 千锤百炼, 浴火重生, 水滴石穿, 披荆斩棘, 志在千里, 鸿鹄之志, 临危不惧, 坚不可摧, 乘风破浪, 海纳百川, 勤能补拙, 十年磨剑, 功成名就, 山河壮阔, 行稳致远, 锲而不舍, 奋发图强, 持之以恒

RETOURNE STRICTEMENT CE FORMAT JSON (rien d'autre, pas de markdown):
{
  "chinese": "成语",
  "pinyin": "pínyīn avec tones",
  "french_translation": "traduction courte",
  "english_translation": "English translation",
  "meaning": "Explication COMPLÈTE en français de la signification profonde et philosophique. Pourquoi cet idiome existe? Quelle est son histoire? Quand l'utilise-t-on? Qu'enseigne-t-il? Donne au moins 3-4 phrases détaillées.",
  "ai_explanation": "Explication pour apprendre cet idiome efficacement en français. Comment bien le comprendre et l'utiliser?",
  "example_sentence": "une phrase exemple en chinois simplifié",
  "example_pinyin": "pinyin de la phrase",
  "example_french": "traduction française de la phrase"
}`,
            },
          ],
          temperature: 0.6,
          max_tokens: 700,
          top_p: 0.85,
        }),
      },
    );

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("❌ Mammouth error:", aiResponse.status, errorText);
      return NextResponse.json(
        {
          error: "AI API failed",
          status: aiResponse.status,
          details: errorText,
        },
        { status: 500 },
      );
    }

    const aiData = await aiResponse.json();
    console.log("✅ AI Response received");

    if (!aiData.choices?.[0]?.message?.content) {
      console.error("❌ No content in AI response");
      return NextResponse.json(
        { error: "No content from AI" },
        { status: 500 },
      );
    }

    let content = aiData.choices[0].message.content.trim();
    console.log("📝 Raw content:", content.substring(0, 300));

    // Nettoyer le contenu
    content = content
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    let idiomData;
    try {
      idiomData = JSON.parse(content);
      console.log("✅ JSON parsed successfully");
    } catch (parseError) {
      console.error("❌ First JSON parse failed, trying to extract...");

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error("Content:", content);
        return NextResponse.json(
          {
            error: "Invalid JSON from AI",
            raw: content.substring(0, 300),
          },
          { status: 500 },
        );
      }

      try {
        idiomData = JSON.parse(jsonMatch[0]);
        console.log("✅ Extracted JSON parsed successfully");
      } catch (secondError) {
        console.error("❌ Second parse failed:", secondError);
        console.error("Extracted content:", jsonMatch[0].substring(0, 300));
        return NextResponse.json(
          {
            error: "Cannot parse extracted JSON",
            extracted: jsonMatch[0].substring(0, 200),
          },
          { status: 500 },
        );
      }
    }

    console.log("✅ Parsed idiom:", idiomData);

    // Validation stricte des champs obligatoires
    if (
      !idiomData.chinese ||
      !idiomData.pinyin ||
      !idiomData.french_translation ||
      !idiomData.meaning
    ) {
      console.error("❌ Missing required fields:", idiomData);
      return NextResponse.json(
        {
          error: "Missing required fields",
          received: Object.keys(idiomData),
        },
        { status: 500 },
      );
    }

    // Double check pour les doublons
    if (existingChinese.includes(idiomData.chinese)) {
      console.error("❌ Idiom already exists:", idiomData.chinese);
      return NextResponse.json(
        { error: "Idiom already exists, generating new one...", status: 409 },
        { status: 409 },
      );
    }

    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + 1);

    // ADAPTER AUX COLONNES RÉELLES DE LA TABLE
    const { data: newIdiom, error: insertError } = await supabase
      .from("idioms")
      .insert([
        {
          chinese: idiomData.chinese,
          pinyin: idiomData.pinyin,
          french_translation: idiomData.french_translation,
          english_translation: idiomData.english_translation || "",
          meaning: idiomData.meaning, // Colonne existante
          ai_explanation: idiomData.ai_explanation || idiomData.meaning,
          example_sentence: idiomData.example_sentence || "",
          example_pinyin: idiomData.example_pinyin || "",
          example_french: idiomData.example_french || "",
          next_review: nextReview.toISOString(),
          phase: "learning",
          review_count: 0,
          difficulty: 1,
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (insertError) {
      console.error("❌ Insert error:", insertError);
      return NextResponse.json(
        { error: "Database insert failed", details: insertError.message },
        { status: 500 },
      );
    }

    console.log("✅ Success! Created idiom:", newIdiom.id);

    return NextResponse.json(
      { success: true, idiom: newIdiom },
      { status: 201 },
    );
  } catch (error) {
    console.error("❌ Unexpected error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: String(error),
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
