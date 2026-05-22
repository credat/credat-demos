import pc from "picocolors";

export function title(text: string): void {
	console.log(`\n${pc.bold(pc.cyan(text))}`);
}

export function rule(): void {
	console.log(pc.dim("─".repeat(58)));
}

export function section(text: string): void {
	console.log(`\n${pc.bold(text)}`);
}

export function step(text: string): void {
	console.log(`  ${pc.cyan("→")} ${text}`);
}

export function detail(text: string): void {
	console.log(`    ${pc.dim(text)}`);
}

export function allow(text: string): void {
	console.log(`  ${pc.green(`✓ ${text}`)}`);
}

export function deny(text: string): void {
	console.log(`  ${pc.red(`✗ ${text}`)}`);
}

export function note(text: string): void {
	console.log(`  ${pc.yellow("•")} ${text}`);
}

export function blank(): void {
	console.log("");
}
