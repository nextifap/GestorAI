import { NextResponse } from "next/server";
import clients from "@/lib/see-clients";

export async function GET(request, { params }) {

    const parametro = params.parametro;

    for (const client of clients) {
        let body = null;
        console.log("OPA TO AKI Ó>>> ", client)
        try {
            client.enqueue(
            `data: ${JSON.stringify(parametro)}\n\n`
            );
        } catch (err) {
            clients.delete(client);
            console.error("Erro ao enviar mensagem para cliente:", err);
        }
    }

    return NextResponse.json(
        { message: 'OK.' }, 
        { status: 200 }
    );
}