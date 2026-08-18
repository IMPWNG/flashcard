// app/api/generate-poem/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    console.log("🚀 Poem API called");

    const MAMMOUTH_API_KEY = process.env.MAMMOUTH_API_KEY;
    if (!MAMMOUTH_API_KEY) {
      console.error("❌ MAMMOUTH_API_KEY is missing");
      return NextResponse.json(
        { error: "API Key not configured" },
        { status: 500 },
      );
    }

    // 🎲 GÉNÈRE UN NOMBRE ALÉATOIRE POUR FORCER UNE RÉPONSE DIFFÉRENTE
    const randomSeed = Math.random();

    console.log("📡 Calling Mammouth API for poem...");

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
              content: `You are an expert in classical Chinese literature with deep knowledge of Chinese poetry across all dynasties and eras. You must provide authentic, historically accurate information about famous Chinese poems. Your responses must be precise, scholarly, and detailed.`,
            },
            {
              role: "user",
              content: `Select ONE famous masterpiece of classical Chinese poetry from ANY era in Chinese history. The poem should be a true historical poem, NOT "Quiet Night Thought" by Li Bai or "The Moon Over the Spring River" by Zhang Ruoxu. Choose a DIFFERENT poem every time.

Random seed: ${randomSeed}

Please respond with ONLY a valid JSON object in this exact format (no markdown, no extra text):
{
  "title": "Poem title in English",
  "author": "Author name",
  "era": "Dynasty/Period name",
  "period_characteristics": "Brief description of the historical period",
  "chinese_text": "Full poem in traditional Chinese characters",
  "pinyin_text": "Full poem in pinyin with tone marks",
  "poem_form": "Type of poem (e.g., shi, ci, qu)",
  "literal_translation": "Word-by-word literal translation to English",
  "real_meaning": "The deeper meaning and interpretation of the poem",
  "historical_context": "Historical background and context",
  "thematic_analysis": "Analysis of themes and literary devices",
  "influence_legacy": "Influence and legacy of this poem",
  "notable_aspects": "Notable aspects that make this poem special"
}`,
            },
          ],
          temperature: 1.0, // 👈 AUGMENTÉ POUR PLUS DE VARIATION
          max_tokens: 1200,
        }),
      },
    );

    if (!aiResponse.ok) {
      console.error("❌ Mammouth API error:", aiResponse.statusText);
      return NextResponse.json(
        { error: "Failed to generate poem" },
        { status: 500 },
      );
    }

    const aiData = await aiResponse.json();
    console.log("✅ Mammouth API response received");

    // ✅ EXTRACTION ET PARSE DU JSON
    let poemData;
    const content = aiData.choices[0].message.content;

    // Essaye de parser directement
    try {
      poemData = JSON.parse(content);
    } catch {
      // Si ça échoue, cherche le JSON dans la réponse
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error("❌ No JSON found in response:", content);
        return NextResponse.json(
          { error: "Cannot extract JSON from response" },
          { status: 500 },
        );
      }
      try {
        poemData = JSON.parse(jsonMatch[0]);
      } catch {
        console.error("❌ Cannot parse JSON:", jsonMatch[0]);
        return NextResponse.json(
          { error: "Cannot parse extracted JSON" },
          { status: 500 },
        );
      }
    }

    console.log("✅ Parsed poem data:", poemData.title);

    // ✅ VALIDATION DES CHAMPS OBLIGATOIRES
    if (
      !poemData.chinese_text ||
      !poemData.pinyin_text ||
      !poemData.literal_translation ||
      !poemData.real_meaning ||
      !poemData.title ||
      !poemData.author ||
      !poemData.era
    ) {
      console.error("❌ Missing required fields:", poemData);
      return NextResponse.json(
        { error: "Missing required fields in AI response" },
        { status: 500 },
      );
    }

    // ✅ INSÉRER DANS SUPABASE
    const { data: newPoem, error: insertError } = await supabase
      .from("poems")
      .insert([
        {
          title: poemData.title,
          author: poemData.author,
          era: poemData.era,
          period_characteristics: poemData.period_characteristics || "",
          chinese_text: poemData.chinese_text,
          pinyin_text: poemData.pinyin_text,
          poem_form: poemData.poem_form || "",
          literal_translation: poemData.literal_translation,
          real_meaning: poemData.real_meaning,
          historical_context: poemData.historical_context || "",
          thematic_analysis: poemData.thematic_analysis || "",
          influence_legacy: poemData.influence_legacy || "",
          notable_aspects: poemData.notable_aspects || "",
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

    console.log("✅ Success! Created poem:", newPoem.id);
    return NextResponse.json({ success: true, poem: newPoem }, { status: 201 });
  } catch (error) {
    console.error("❌ Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: String(error) },
      { status: 500 },
    );
  }
}
