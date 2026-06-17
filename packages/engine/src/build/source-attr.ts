/** Inert <script> carrier attribute for the embedded deck source package (eject).
 *  Lives in its own zero-dependency module so browser runtime (`../source.ts`) can
 *  read it without pulling in the Bun/node-only packer in `source-package.ts`. */
export const SOURCE_ATTR = "data-liebstoeckel-source";
