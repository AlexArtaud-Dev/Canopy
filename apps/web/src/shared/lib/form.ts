/** Text value of a form field; files and missing fields read as an empty string. */
export function formText(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}
