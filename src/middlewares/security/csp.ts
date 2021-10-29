import { Url } from "../../helpers/url";
import { HttpHandler } from "../../typings/index.types";
import { randomBytes } from "crypto";

const generateNonceDefault = () => randomBytes(32).toString("base64");

type Args = { domain: string; nonce: string; allowedList: string };

type CspRule = (args: Args) => string;

const baseUri: CspRule = () => `base-uri 'self'`;

const objectSrc: CspRule = () => `object-src 'none'`;

const defaultSrc: CspRule = () => `default-src 'none'`;

const styleSrc: CspRule = (args) => `style-src 'self' 'nonce-${args.nonce}'`;

const styleSrcElementWithNonce: CspRule = (args) => `style-src-elem 'self' 'report-sample' 'nonce-${args.nonce}' ${args.domain} ${args.allowedList}`;

const fontSrc: CspRule = (args) => `font-src ${args.domain} ${args.allowedList}`;

const cspDomains: CspRule = (args) => `${args.domain} ${args.allowedList}`.trim();

const scriptSrcElem: CspRule = (args) => `script-src-elem 'self' 'report-sample' 'unsafe-inline' 'nonce-${args.nonce}' ${cspDomains(args)}`;

const connectSrc: CspRule = (args) => `connect-src 'self' ${Url.removeHttpProtocol(args.domain)} ${args.allowedList}`;

const frameAncestor = () => `frame-ancestors 'none'`;

const frameSrc = () => `frame-src 'none'`;

const childSrc = () => `child-src 'none'`;

const formAction: CspRule = (args) => `form-action 'self' ${args.domain} 'nonce-${args.nonce}' 'report-sample'`;

const imgSrc: CspRule = (args) => `img-src 'self' ${args.domain} data:`;

const prefetchSrc: CspRule = (args) => `prefetch-src 'self' ${args.domain}`;

const manifestSrc: CspRule = () => `manifest-src 'self'`;

const mediaSrc: CspRule = (args) => `media-src ${args.domain}`;

const scriptSrc: CspRule = (args) => `script-src ${args.domain} 'unsafe-inline' 'nonce-${args.nonce}' ${args.allowedList}`;

const upgradeInsecureRequests = () => `upgrade-insecure-requests`;

const legacyBlockMixedContent = () => `block-all-mixed-content`;

const workerSrc = () => `worker-src 'none'`;

const htmlStrictRules: CspRule[] = [
  baseUri,
  mediaSrc,
  manifestSrc,
  prefetchSrc,
  childSrc,
  connectSrc,
  defaultSrc,
  fontSrc,
  frameSrc,
  imgSrc,
  objectSrc,
  scriptSrc,
  formAction,
  scriptSrcElem,
  styleSrc,
  styleSrcElementWithNonce,
  legacyBlockMixedContent,
  upgradeInsecureRequests,
  workerSrc,
];

const joinCspRules = (rules: CspRule[], args: Args) => rules.map((fn) => fn(args).trim()).join(";");

const HeaderStrictCsp = (args: Args) => joinCspRules([...htmlStrictRules, frameAncestor], args);

const header = "Content-Security-Policy";

type CspProps = {
  allowedList?: string[];
  generateNonce?: () => string;
};

export const CSP = (props: CspProps = {}) => {
  const allowedList = props.allowedList ?? [];
  const nonceGenerator = props.generateNonce ?? generateNonceDefault;
  const cspHandler: HttpHandler = (req, res, next) => {
    res.setHeader(header, HeaderStrictCsp({ domain: req.hostname, nonce: nonceGenerator(), allowedList: allowedList.join(" ") }));
    next();
  };
  return cspHandler;
};
