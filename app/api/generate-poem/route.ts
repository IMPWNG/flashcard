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

    // ✅ MEILLEURE LOGIQUE : Semaine ISO (conforme à ISO 8601)
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const diff = now.getTime() - start.getTime();
    const oneWeek = 1000 * 60 * 60 * 24 * 7;
    const currentWeek = Math.floor(diff / oneWeek) + 1;
    const currentYear = now.getFullYear();

    console.log(`📅 Current week: ${currentWeek}, Year: ${currentYear}`);

    // ✅ VÉRIFIER SI UN POÈME EXISTE DÉJÀ CETTE SEMAINE (avec l'année)
    const { data: existingPoem, error: queryError } = await supabase
      .from("poems")
      .select("*")
      .eq("week_number", currentWeek)
      .eq("year", currentYear) // ✅ AJOUTER LA VÉRIFICATION ANNÉE
      .limit(1)
      .single();

    if (queryError && queryError.code !== "PGRST116") {
      // PGRST116 = "no rows found" c'est normal
      console.error("❌ Query error:", queryError);
      return NextResponse.json(
        { error: "Database error", details: queryError.message },
        { status: 500 },
      );
    }

    // ✅ SI LE POÈME EXISTE, LE RETOURNER DIRECTEMENT
    if (existingPoem) {
      console.log("✅ Poem already exists this week, returning existing poem");
      return NextResponse.json(
        { poem: existingPoem, fromCache: true },
        { status: 200 },
      );
    }

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
              content: `Select ONE famous masterpiece of classical Chinese poetry from ANY era in Chinese history (from ancient Zhou through Qing dynasty - include Shang, Zhou, Qin, Han, Wei-Jin, Northern-Southern dynasties, Tang, Song, Yuan, Ming, Qing, and pre-dynastic periods). Choose from the most celebrated and historically significant poems.

Return ONLY pure, valid JSON (no markdown, no code blocks, no extra text):

{
  "title": "English translation of the poem's title",
  "author": "Author's full name in English",
  "era": "Specific dynasty and approximate dates",
  "period_characteristics": "Key poetic and cultural characteristics of this era that influenced this poem",
  "chinese_text": "Complete original Classical Chinese text exactly as historically recorded - preserve ALL line breaks and punctuation with \\n",
  "pinyin_text": "Full pinyin romanization with tone marks (1=high, 2=rising, 3=low, 4=falling) - preserve ALL line breaks with \\n",
  "poem_form": "Specific poetic form (e.g., 'Regulated verse (jintishi)', 'Ci poem', 'Free verse (gushi)', 'Four-line quatrain (jueju)')",
  "literal_translation": "Word-by-word and line-by-line literal translation showing exactly what each character/phrase means - preserve line breaks with \\n",
  "real_meaning": "The profound philosophical, emotional, and spiritual essence of the poem (4-5 sentences). Explain what the poet truly expressed - themes of nature, mortality, separation, duty, melancholy, enlightenment, love, loss, etc. What was the poet's state of mind and message?",
  "historical_context": "Why this poem is significant in Chinese literary history. What makes it a masterpiece? How did it influence subsequent poetry? What was happening in the poet's life or era?",
  "thematic_analysis": "Main themes, imagery, and symbolism used throughout the poem",
  "influence_legacy": "How this poem influenced Chinese culture, literature, and philosophy",
  "notable_aspects": "What makes this poem particularly remarkable or unique"
}

CRITICAL REQUIREMENTS:
- Select a REAL, FAMOUS, HISTORICALLY DOCUMENTED poem (not invented)
- Chinese text and pinyin MUST be 100% accurate to historical records
- Preserve exact line breaks and formatting
- Real meaning must capture the deep emotional and philosophical core
- Include specific dynasty information with dates
- All translations must be scholarly and precise
- Tone marks in pinyin are MANDATORY (ā á ǎ à for each vowel)`,
            },
          ],
          temperature: 0.6,
          max_tokens: 1200,
        }),
      },
    );

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("❌ Mammouth error:", aiResponse.status, errorText);
      return NextResponse.json(
        { error: "AI API failed", status: aiResponse.status },
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

    const content = aiData.choices[0].message.content;
    console.log("📝 Parsing AI response...");

    let poemData;
    try {
      poemData = JSON.parse(content);
    } catch (parseError) {
      console.error("❌ JSON parse failed:", parseError);
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return NextResponse.json(
          { error: "Invalid JSON from AI", content: content.substring(0, 100) },
          { status: 500 },
        );
      }
      try {
        poemData = JSON.parse(jsonMatch[0]);
      } catch {
        return NextResponse.json(
          { error: "Cannot parse extracted JSON" },
          { status: 500 },
        );
      }
    }

    console.log("✅ Parsed poem data");

    // ✅ VALIDATION
    if (
      !poemData.chinese_text ||
      !poemData.pinyin_text ||
      !poemData.literal_translation ||
      !poemData.real_meaning ||
      !poemData.title ||
      !poemData.author ||
      !poemData.era
    ) {
      console.error("❌ Missing required fields:", Object.keys(poemData));
      return NextResponse.json(
        { error: "Missing required fields in AI response" },
        { status: 500 },
      );
    }

    // ✅ INSÉRER DANS LA BDD
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
          week_number: currentWeek,
          year: currentYear, // ✅ AJOUTER L'ANNÉE
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
    return NextResponse.json(
      { success: true, poem: newPoem, fromCache: false },
      { status: 201 },
    );
  } catch (error) {
    console.error("❌ Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: String(error) },
      { status: 500 },
    );
  }
}
