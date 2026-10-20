import { createFileRoute } from "@tanstack/react-router";
import { handleAccountAssistantChat } from "@/lib/account-assistant-chat.server";
export const Route=createFileRoute("/api/account-assistant")({server:{handlers:{POST:({request})=>handleAccountAssistantChat(request)}}});