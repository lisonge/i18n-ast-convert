import crypto from 'node:crypto';

const getKeyFromStr = (str: string): string => {
  const res: string = crypto
    .createHash('md5')
    .update(str)
    .digest('hex')
    .substring(0, 8);
  let first: number | string = Number(res[0]);

  if (Number.isInteger(first)) {
    first = 'hkmnrstuvwxz'[first];
    return first + res.slice(1);
  }

  return res;
};

export default getKeyFromStr;
