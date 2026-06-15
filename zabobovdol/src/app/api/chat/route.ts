import { NextResponse } from "next/server";
import { answerQuestion } from "@/lib/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { question?: unknown };
    const question = typeof body.question === "string" ? body.question : "";
    if (question.trim().length < 2) {
      return NextResponse.json(
        { answer: "Моля, напишете по-дълъг въпрос.", sources: [] },
        { status: 400 },
      );
    }
    if (question.length > 500) {
      return NextResponse.json(
        { answer: "Въпросът е твърде дълъг.", sources: [] },
        { status: 400 },
      );
    }
    const result = await answerQuestion(question);
    return NextResponse.json(result);
  } catch (err) {
    console.error("chat error", err);
    return NextResponse.json(
      { answer: "Възникна грешка. Опитайте отново.", sources: [] },
      { status: 500 },
    );
  }
}
