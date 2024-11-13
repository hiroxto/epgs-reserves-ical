import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import ical, { ICalCalendarMethod } from "ical-generator";
import { z } from "zod";

type Bindings = {
  EPGS_ICAL_BUCKET: R2Bucket;
};

// フルパラメータで送ってくるのは許容し，最低限必要な部分だけバリデーションする
const schema = z.object({
  reserves: z.array(
    z.object({
      startAt: z.number().positive(),
      endAt: z.number().positive(),
      name: z.string(),
      description: z.string(),
      extended: z.string(),
    }),
  ),
});

const app = new Hono<{ Bindings: Bindings }>();

app.get("/", c => {
  return c.text("Hello Hono!");
});

app.post(
  "/update",
  zValidator("json", schema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            message: "バリデーションエラー!",
            detail: result.error.flatten(),
          },
        },
        400,
      );
    }
  }),
  async c => {
    const body = c.req.valid("json");

    const calendar = ical({ name: "my first iCal" });
    for (const reserve of body.reserves) {
      calendar.createEvent({
        start: new Date(reserve.startAt),
        end: new Date(reserve.endAt),
        summary: reserve.name,
        description: `${reserve.description}\n\n${reserve.extended}`,
      });
    }

    const bucket = c.env.EPGS_ICAL_BUCKET;
    await bucket.put("epgs.ical", calendar.toString());

    return c.text("更新しますた!");
  },
);

export default app;
