/**
 * A store over a page that records every write and reads back what it was told.
 *
 * For the state-layer suites, which are about *what gets written and what
 * doesn't* rather than about anything on screen. Both checkbox flags are here
 * because a creature can be legendary and have a lair, and the gestures that
 * set them reach into each other's prose.
 */
import type { PageAdapter } from "../adapter/types.js";
import type { Monster, SectionKey } from "../statblock/model.js";
import { EditorStore } from "../state/store.js";

/** One write: a section key and its HTML, or a flag name and its new value. */
export type Write = [key: string, value: unknown];

export interface RecordingPage {
  store: EditorStore;
  /** Every write, in the order the commands made them. */
  wrote: Write[];
  /** Just the values written under one key. */
  written(key: string): unknown[];
}

export function recordingPage(monster: Monster): RecordingPage {
  const wrote: Write[] = [];
  let current = monster;
  const flag = (key: keyof Monster) => (on: boolean) => {
    wrote.push([key, on]);
    current = { ...current, [key]: on };
  };
  const adapter = {
    read: () => current,
    observe: () => () => {},
    onAvatarChosen: () => () => {},
    save: () => Promise.resolve(),
    setDescription: (section: SectionKey, html: string) => {
      wrote.push([section, html]);
      current = { ...current, descriptionHtml: { ...current.descriptionHtml, [section]: html } };
    },
    setLegendary: flag("isLegendary"),
    setHasLair: flag("hasLair"),
    setMythic: flag("isMythic"),
  } as unknown as PageAdapter;

  const store = new EditorStore(adapter);
  store.start();
  return {
    store,
    wrote,
    written: (key) => wrote.filter(([k]) => k === key).map(([, value]) => value),
  };
}
