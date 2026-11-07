import { formText } from './form';

describe('formText', () => {
  it('reads strings and treats files and missing fields as empty', () => {
    const form = new FormData();
    form.set('name', 'ada');
    form.set('upload', new Blob(['x']), 'x.txt');
    expect(formText(form, 'name')).toBe('ada');
    expect(formText(form, 'upload')).toBe('');
    expect(formText(form, 'missing')).toBe('');
  });
});
