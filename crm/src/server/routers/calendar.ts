import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";

export const calendarRouter = router({
  _ping: protectedProcedure.input(z.void()).query(() => "ok"),
});
