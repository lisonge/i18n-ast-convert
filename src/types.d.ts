interface HandleCodeResult {
  code: string;
  i18nMap: Map<string, string>;
  undone?: boolean;
}

interface InputCliOptions {
  dir: string;
}
