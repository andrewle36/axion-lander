import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";

export const dealsRouter = router({
  _ping: protectedProcedure.input(z.void()).query(() => "ok"),
});
