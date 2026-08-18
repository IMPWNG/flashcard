import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    console.log("🚀 Pinyin API called");

    const MAMMOUTH_API_KEY = process.env.MAMMOUTH_API_KEY;
    if (!MAMMOUTH_API_KEY) {
      console.error("❌ MAMMOUTH_API_KEY is missing");
      return NextResponse.json(
        { error: "API Key not configured" },
        { status: 500 },
      );
    }

    // 1️⃣ RÉCUPÈRE TOUS LES MOTS DE LA BDD
    const { data: allCards, error: fetchError } = await supabase
      .from("my_vocab")
      .select("id, word");

    if (fetchError) {
      console.error("❌ Fetch error:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch vocabulary" },
        { status: 500 },
      );
    }

    console.log(`📚 Found ${allCards?.length || 0} words to process`);

    if (!allCards || allCards.length === 0) {
      return NextResponse.json(
        { error: "No vocabulary cards found" },
        { status: 400 },
      );
    }

    // 2️⃣ APPELLE L'IA POUR GÉNÉRER LE PINYIN
    const wordsToProcess = allCards.map((card) => card.word).join("\n");

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
              content: `You are an expert in Chinese language. You must provide accurate pinyin with tone marks for Chinese words and phrases. If a word is not in Chinese characters, return it as-is.`,
            },
            {
              role: "user",
              content: `For each word/phrase below, provide the pinyin with tone marks. Respond with ONLY a JSON object, no markdown or extra text.

Words to convert:
${wordsToProcess}

Respond in this format (example):
{
  "pinyin_data": [
    {"word": "你好", "pinyin": "nǐ hǎo"},
    {"word": "谢谢", "pinyin": "xièxie"},
    {"word": "hello", "pinyin": "hello"}
  ]
}`,
            },
          ],
          temperature: 0.3,
          max_tokens: 2000,
        }),
      },
    );

    if (!aiResponse.ok) {
      console.error("❌ Mammouth API error:", aiResponse.statusText);
      return NextResponse.json(
        { error: "Failed to generate pinyin" },
        { status: 500 },
      );
    }

    const aiData = await aiResponse.json();
    console.log("✅ Mammouth API response received");

    // 3️⃣ PARSE LA RÉPONSE
    let pinyinData;
    const content = aiData.choices[0].message.content;

    try {
      pinyinData = JSON.parse(content);
    } catch {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error("❌ No JSON found in response");
        return NextResponse.json(
          { error: "Cannot extract JSON from response" },
          { status: 500 },
        );
      }
      pinyinData = JSON.parse(jsonMatch[0]);
    }

    console.log("✅ Parsed pinyin data");

    // 4️⃣ MET À JOUR LA BDD
    let updateCount = 0;
    let errors = [];

    if (pinyinData.pinyin_data && Array.isArray(pinyinData.pinyin_data)) {
      for (const item of pinyinData.pinyin_data) {
        const card = allCards.find((c) => c.word === item.word);
        if (card) {
          const { error: updateError } = await supabase
            .from("my_vocab")
            .update({ pinyin: item.pinyin || item.word })
            .eq("id", card.id);

          if (updateError) {
            errors.push(`${item.word}: ${updateError.message}`);
          } else {
            updateCount++;
          }
        }
      }
    }

    console.log(`✅ Updated ${updateCount} words`);

    return NextResponse.json(
      {
        success: true,
        message: `Pinyin generated for ${updateCount} words`,
        updatedCount: updateCount,
        errors: errors,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("❌ Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: String(error) },
      { status: 500 },
    );
  }
}
