# Sunup: design

Sunup is the homestead life sim. It runs on the farm simulation in `src/sim` under one fixed set of rules (the Sunup preset), drawn by the 3D diorama renderer. The sections below describe the simulation as first built with its switchable axes; only the Sunup values apply now, and the other axes stay in the simulation only because its tests exercise them.

Three farming games share one farm. The player can change any rule at any moment and keep playing the same farm. The point is to find out which farming game is the most fun by playing them, and the mixes between them.

## The three games

**Sunup: a day on the homestead.** 3D, close camera, walk the farmer, real-time day with stamina, classic water-every-day growth, a shop, wild weather, solo, a kit of tools. The fun is the routine: wake, walk the rows, water and pull, toss the crop in the crate, chase off a crow, sleep. Each day is a small run you get better at.

**Patchwork: the almanac puzzle.** 2D, wide camera, point at tiles, twelve moves a day with time frozen, synergy soil (moisture, nutrients, companions, quality), seasonal almanac goals with stars and a seed draft, wild weather with a three-day forecast, solo, one smart action. The fun is planning: where does the corn go so the beans can climb it and the lettuce gets its shade, with rain due on Thursday.

**Bushel & Co.: the farm that runs itself.** 3D, wide camera, point and drag, a continuous clock you can speed up, classic growth, town orders with deadlines and a market that moves, calm weather, a crew of farmhands, one smart action. The fun is the machine: hire hands, put down sprinklers, lay out fields to fill the orders, then speed up time and watch it work.

## Axes

Every axis is independent. A mix that matches no preset is a custom game and is just as valid.

| Axis | Options | What changes |
| --- | --- | --- |
| View | 2D, 3D | Which renderer draws. Nothing in the rules. |
| Camera | Close, Wide | Close follows the farmer. Wide frames the farm with pan and zoom. |
| Control | Walk, Point | Walk: move with keys, stick or a thumb pad, act on the tile in front. Point: tap or drag tiles to queue jobs and the farmer walks to them. |
| Clock | Day, Turns, Flow | Day: 6:00 to midnight in four real minutes, stamina, sleep to end the day. Turns: time waits, twelve moves a day, end the day when you like. Flow: a minute a day, pause and 1x, 2x, 4x, days roll on their own. |
| Soil | Classic, Synergy | Classic: watered today means it grows a day. Synergy: moisture lasts (0 to 3, minus one a night), nutrients drain and refill, neighbours set quality. |
| Goal | Market, Almanac, Orders | Market: stock sells overnight at fixed prices, buy fields and buildings, milestones. Almanac: ten-day seasons with three goals each, stars, and a pick of one new seed each season. Orders: stock is kept, town orders pay a premium before a deadline, selling floods the market and prices recover over days. |
| Weather | Calm, Wild | Calm: sun, cloud and the odd shower. Wild: a three-day forecast with rain, storms and heat, crows that eat crops, bugs that spread. |
| Crew | Solo, Crew | Crew: farmhands from the bunkhouse harvest, replant, water, pick bugs and chase crows, and take jobs you paint. Wages each night. |
| Tools | Kit, Smart | Kit: hoe, can, seeds, hands, build. Smart: one action that harvests, waters, plants, tills, tends or scares as the tile needs. |

## Shared rules

- The farm is 20 by 15 tiles. Six fields of 4 by 4. The first is owned and tilled; the rest are bought from the notice board. A new field starts as meadow and needs tilling once. Tilled soil stays tilled.
- Eight crops. Seeds are paid for when planted. Harvests go to stock, then to the crate.
- Classic growth: a crop grows one day each night it was watered that day. Three dry nights in a row and it withers. Ripe crops wait and never wither.
- Synergy growth: a crop grows if moisture at nightfall meets its thirst (1, lettuce 2). Moisture drops by one each night, two in a heat wave. Quality from 0 to 3 is shown while it grows: +1 a companion next door, +1 a sunflower next door (bees), +1 rich soil (nutrient 2 or more), minus 1 spent soil (0), minus 1 crowded by two or more of the same crop, minus 1 if it ever went thirsty. Quality multiplies the price by 1, 1.25, 1.5 or 2. Harvests use nutrient; beans put it back on their tile and the four around it; empty soil recovers slowly.
- Rain waters every plot. Sprinklers water the 3 by 3 around them each morning. Scarecrows keep crows off everything within three tiles.
- Crows land on unprotected crops. Walk near one or tap it to scare it. Left alone, it eats the crop after two game hours (turns: at nightfall).
- Bugs appear on a few growing crops each wild morning and spread to the same crop next door. Bugged crops stop growing and die after four nights. Tend to pick them off.

## Switching

A switch never loses progress, moves the farmer into a wall, or strands a job.

- Day to Turns: moves left = the smaller share of time or stamina left. Turns to Day: the clock jumps to match moves used, stamina matches moves left. Flow keeps the clock where it is.
- Classic to Synergy: watered plots read as moist. Synergy to Classic: moist plots read as watered today.
- Crew off: hands go into the bunkhouse, their jobs go back on the board, no wages. Crew on: the first time, one hand joins for free.
- Wild to Calm: crows fly off and bugs go.
- Point to Walk: the farmer drops queued jobs (hands keep theirs under Crew).
- Almanac starts at the current season the first time it is switched on, with every crop already in the ground unlocked.

## Feedback for the designer

The mixer shows how long has been spent in each option, and a notes box stamped with the current mix. This is the lab: the game exists to find the best mix.
