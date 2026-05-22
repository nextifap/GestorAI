import chatService from "@/app/(api)/services/chatService";
import { NextResponse } from "next/server";

export async function POST(request, { params }) {

    chatService.receiveAMessage("Testando essa bagaça");

    return NextResponse.json(
        { message: 'OK.' }, 
        { status: 200 }
    );
}