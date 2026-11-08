import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";

export const commissionsRouter = router({
  _ping: protectedProcedure.input(z.void()).query(() => "ok"),
});
