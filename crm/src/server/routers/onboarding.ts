import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";

export const onboardingRouter = router({
  _ping: protectedProcedure.input(z.void()).query(() => "ok"),
});
