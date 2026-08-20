import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  countDialogueGroups,
  getStageTargets,
  type ContentStage,
  type StageTargets,
} from "@/lib/weeklyTheme";

const THEMES = [
  "Introducing yourself and talking about your background",
  "Greeting people and saying goodbye",
  "Talking about your daily routine",
  "Buying fruits and vegetables at the market",
  "Ordering coffee or a drink",
  "Going to the pharmacy",
  "Making an appointment",
  "At the dentist’s office",
  "Renting an apartment",
  "Talking to your landlord",
  "Paying bills",
  "Withdrawing money from an ATM",
  "Getting your phone repaired",
  "Buying a SIM card",
  "Using a mobile app",
  "Calling customer service",
  "Sending or receiving a package",
  "At the post office",
  "Shopping at the market",
  "Asking for the price and bargaining",
  "Buying train or plane tickets",
  "At the airport",
  "Traveling by train",
  "Booking a table",
  "Inviting someone to your home",
  "Talking about your hobbies",
  "Making vacation plans",
  "Expressing your likes and preferences",
  "Talking about your health",
  "Describing a problem or an emergency",
  "Getting to know a colleague",
  "Talking about your job",
  "Taking part in a meeting",
  "Asking for help",
  "Apologizing and thanking someone",
  "Expressing agreement or disagreement",
  "Understanding numbers, dates, and times",
  "Talking about Chinese festivals and traditions",
  "Making purchases at a supermarket",
  "Taking a taxi or ride-sharing",
  "Chatting with friends",
  "Ordering food at a restaurant",
  "At the doctor’s office",
  "Hotel check-in and accommodation",
  "Shopping for clothes",
  "Using public transportation",
  "At the bank",
  "Asking for directions",
  "Small talk with neighbors",
  "Job interview",
  "At the gym or fitness center",
  "Movie theater visit",
  "Online shopping",
  "At the hair salon",
  "Weather conversation",
  "Family gathering",
  "University classroom",
  "Weekend plans",
];

function parseStage(value: unknown): ContentStage {
  const n = Number(value);
  if (n === 1 || n === 2 || n === 3 || n === 4) return n;
  return 1;
}

function parseJsonContent(content: string) {
  try {
    return JSON.parse(content);
  } catch {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  }
}

async function callMammouth(apiKey: string, userPrompt: string) {
  const aiResponse = await fetch("https://api.mammouth.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1-nano",
      messages: [
        {
          role: "system",
          content:
            "You are an expert Chinese language teacher specializing in HSK levels from level 2 to level 5. Create comprehensive, practical weekly content for language learners. Include vocabulary with proper pinyin and English translations, plus realistic dialogues and isolated phrases that learners can use in their daily life.",
        },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 4000,
    }),
  });

  if (!aiResponse.ok) {
    throw new Error(`Mammouth API error: ${aiResponse.statusText}`);
  }

  const aiData = await aiResponse.json();
  const parsed = parseJsonContent(aiData.choices[0].message.content);
  if (!parsed) {
    throw new Error("Cannot extract JSON from response");
  }
  return parsed;
}

async function saveVocabulary(themeId: string, vocabulary: any[]) {
  if (!Array.isArray(vocabulary) || vocabulary.length === 0) return 0;

  const vocabData = vocabulary.map((vocab: any) => ({
    theme_id: themeId,
    chinese_word: vocab.chinese,
    english_translation: vocab.english,
    pinyin: vocab.pinyin,
    hsk_level: vocab.hsk_level,
  }));

  const { error } = await supabase.from("theme_vocabulary").insert(vocabData);
  if (error) {
    console.error("❌ Vocabulary insert error:", error);
    return 0;
  }
  return vocabData.length;
}

async function savePhrases(
  themeId: string,
  phrases: any[],
  startOrder: number,
) {
  if (!Array.isArray(phrases) || phrases.length === 0) return 0;

  const phrasesData = phrases.map((phrase: any, index: number) => ({
    theme_id: themeId,
    phrase_type: phrase.type,
    speaker: phrase.speaker || null,
    chinese_text: phrase.chinese,
    english_translation: phrase.english,
    pinyin: phrase.pinyin,
    hsk_level: phrase.hsk_level,
    phrase_order: startOrder + index,
  }));

  const { error } = await supabase.from("theme_phrases").insert(phrasesData);
  if (error) {
    console.error("❌ Phrases insert error:", error);
    return 0;
  }
  return phrasesData.length;
}

function jsonSchemaHint() {
  return `Respond ONLY with this JSON format (no markdown, no extra text):
{
  "theme_name": "Theme name here",
  "theme_description": "Brief description of the theme",
  "vocabulary": [
    {
      "chinese": "你好",
      "pinyin": "nǐ hǎo",
      "english": "hello",
      "hsk_level": 2
    }
  ],
  "phrases_and_dialogues": [
    {
      "type": "dialogue",
      "speaker": "Person A",
      "chinese": "你今天怎么样？",
      "pinyin": "nǐ jīn tiān zěn me yàng?",
      "english": "How are you today?",
      "hsk_level": 2
    },
    {
      "type": "dialogue",
      "speaker": "Person B",
      "chinese": "我很好，谢谢你问。",
      "pinyin": "wǒ hěn hǎo, xièxie nǐ wèn.",
      "english": "I'm very well, thank you for asking.",
      "hsk_level": 2
    },
    {
      "type": "isolated_phrase",
      "speaker": null,
      "chinese": "请问...多少钱？",
      "pinyin": "qǐng wèn... duō shao qián?",
      "english": "Excuse me, how much is...?",
      "hsk_level": 2
    }
  ]
}`;
}

export async function POST(req: NextRequest) {
  try {
    console.log("🚀 Weekly Theme API called");

    const MAMMOUTH_API_KEY = process.env.MAMMOUTH_API_KEY;
    if (!MAMMOUTH_API_KEY) {
      console.error("❌ MAMMOUTH_API_KEY is missing");
      return NextResponse.json(
        { error: "API Key not configured" },
        { status: 500 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const weekStart =
      typeof body.weekStart === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.weekStart)
        ? body.weekStart
        : new Date().toISOString().split("T")[0];
    const stage = parseStage(body.stage);
    const targets = getStageTargets(stage);

    const { data: existingTheme } = await supabase
      .from("daily_themes")
      .select("id, theme_name, theme_description")
      .eq("generated_date", weekStart)
      .maybeSingle();

    if (!existingTheme) {
      const randomTheme = THEMES[Math.floor(Math.random() * THEMES.length)];
      console.log(`🎯 New weekly theme: ${randomTheme} (stage ${stage})`);

      const themeContent = await callMammouth(
        MAMMOUTH_API_KEY,
        `Generate COMPLETE weekly Chinese learning content for the theme: "${randomTheme}"

This is the start of a 7-day theme. Content grows every 2 days, so create the stage ${stage} amount now:
1. VOCABULARY SECTION: exactly ${targets.vocab} useful words/phrases (HSK 2 to 5)
2. DIALOGUES: exactly ${targets.dialogues} realistic dialogues, each with at least 4-5 exchanges
3. USEFUL PHRASES: exactly ${targets.phrases} isolated useful phrases

Important:
- All Chinese text must be in Simplified Chinese characters
- Provide pinyin with tone marks for EVERY word and phrase
- Provide accurate English translations
- Dialogues should be realistic and practical
- Include various HSK levels (2, 3, 4, 5) mixed throughout
- Put all dialogue lines first (grouped by conversation), then isolated phrases

${jsonSchemaHint()}`,
      );

      const { data: themeData, error: themeError } = await supabase
        .from("daily_themes")
        .insert({
          theme_name: themeContent.theme_name,
          theme_description: themeContent.theme_description,
          generated_date: weekStart,
        })
        .select("id")
        .single();

      if (themeError || !themeData) {
        console.error("❌ Theme creation error:", themeError);
        return NextResponse.json(
          { error: "Failed to create theme" },
          { status: 500 },
        );
      }

      const vocabCount = await saveVocabulary(
        themeData.id,
        themeContent.vocabulary,
      );
      const phraseCount = await savePhrases(
        themeData.id,
        themeContent.phrases_and_dialogues,
        0,
      );

      return NextResponse.json({
        success: true,
        message: `Weekly theme created for week of ${weekStart}`,
        themeId: themeData.id,
        themeName: themeContent.theme_name,
        stage,
        added: { vocabulary: vocabCount, phrases: phraseCount },
      });
    }

    const [{ data: vocabRows }, { data: phraseRows }] = await Promise.all([
      supabase
        .from("theme_vocabulary")
        .select("chinese_word")
        .eq("theme_id", existingTheme.id),
      supabase
        .from("theme_phrases")
        .select("phrase_type, chinese_text, phrase_order")
        .eq("theme_id", existingTheme.id)
        .order("phrase_order", { ascending: true }),
    ]);

    const currentVocab = vocabRows?.length ?? 0;
    const currentPhrases = phraseRows ?? [];
    const currentDialogues = countDialogueGroups(currentPhrases);
    const currentIsolated = currentPhrases.filter(
      (p) => p.phrase_type === "isolated_phrase",
    ).length;

    const delta: StageTargets = {
      vocab: Math.max(0, targets.vocab - currentVocab),
      dialogues: Math.max(0, targets.dialogues - currentDialogues),
      phrases: Math.max(0, targets.phrases - currentIsolated),
    };

    if (delta.vocab === 0 && delta.dialogues === 0 && delta.phrases === 0) {
      return NextResponse.json({
        message: "Weekly theme already has enough content for this stage",
        themeId: existingTheme.id,
        stage,
        alreadyComplete: true,
      });
    }

    const existingWords = (vocabRows ?? [])
      .map((v) => v.chinese_word)
      .filter(Boolean)
      .slice(0, 80)
      .join("、");
    const existingPhrases = currentPhrases
      .map((p) => p.chinese_text)
      .filter(Boolean)
      .slice(0, 40)
      .join(" / ");

    console.log(
      `📈 Expanding "${existingTheme.theme_name}" to stage ${stage}: +${delta.vocab} vocab, +${delta.dialogues} dialogues, +${delta.phrases} phrases`,
    );

    const expansion = await callMammouth(
      MAMMOUTH_API_KEY,
      `Expand this existing weekly Chinese theme with NEW content only.

Theme: "${existingTheme.theme_name}"
Description: "${existingTheme.theme_description}"

Already taught (do NOT repeat these):
Vocabulary: ${existingWords || "(none)"}
Phrases/dialogues: ${existingPhrases || "(none)"}

Add exactly:
1. ${delta.vocab} NEW vocabulary words/phrases (HSK 2 to 5)
2. ${delta.dialogues} NEW complete dialogues (each with at least 4-5 exchanges)
3. ${delta.phrases} NEW isolated useful phrases

Important:
- All Chinese must be Simplified characters
- Pinyin with tone marks for every item
- Accurate English translations
- Mix HSK 2–5
- Put all new dialogue lines first (grouped by conversation), then isolated phrases
- theme_name and theme_description should match the existing theme

${jsonSchemaHint()}`,
    );

    const nextOrder =
      currentPhrases.reduce(
        (max, p) => Math.max(max, p.phrase_order ?? 0),
        -1,
      ) + 1;

    const vocabCount = await saveVocabulary(
      existingTheme.id,
      expansion.vocabulary,
    );
    const phraseCount = await savePhrases(
      existingTheme.id,
      expansion.phrases_and_dialogues,
      nextOrder,
    );

    return NextResponse.json({
      success: true,
      message: `Theme expanded to stage ${stage}`,
      themeId: existingTheme.id,
      themeName: existingTheme.theme_name,
      stage,
      added: { vocabulary: vocabCount, phrases: phraseCount },
    });
  } catch (error) {
    console.error("❌ Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: String(error) },
      { status: 500 },
    );
  }
}
