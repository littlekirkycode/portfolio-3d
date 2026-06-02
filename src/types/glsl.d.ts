/* Allow importing raw shader files as strings (used if shaders are split into files;
   v1 inlines them as template literals, so these are a convenience). */
declare module "*.glsl" {
  const value: string;
  export default value;
}
declare module "*.vert" {
  const value: string;
  export default value;
}
declare module "*.frag" {
  const value: string;
  export default value;
}
