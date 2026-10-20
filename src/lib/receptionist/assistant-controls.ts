import {z} from "zod";
import {receptionistConfigSchema} from "./shared";
export const assistantEditSchema=z.object({id:z.string().uuid(),configuration:receptionistConfigSchema});