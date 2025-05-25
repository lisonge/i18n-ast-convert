interface HandleCodeResult {
  code: string;
  zhMap: Map<string, string>;
  undone?: boolean;
}

interface InputCliOptions {
  dir: string;
  output: string;
}

interface HandleError {
  filePath: string;
  error: Error;
}
