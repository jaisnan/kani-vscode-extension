import {Section, source} from "lcov-parse";
import {OutputChannel} from "vscode";

export enum CoverageType {
    NONE,
    LCOV,
    CLOVER,
    COBERTURA,
    JACOCO,
}

export class CoverageFile {
    public type!: CoverageType;
    private file: string;

    constructor(file: string) {
        this.file = file;
        this.setFileType(this.file);
    }

    /**
     * Takes a data string and looks for indicators of specific files
     * @param file file to detect type information
     */
    private setFileType(file: string) {
        let possibleType = CoverageType.NONE;
        if (
            file.includes("<?xml") &&
            file.includes("<coverage") &&
            file.includes("<project")
        ) {
            possibleType = CoverageType.CLOVER;
        } else if (file.includes("JACOCO")) {
            possibleType = CoverageType.JACOCO;
        } else if (file.includes("<?xml")) {
            possibleType = CoverageType.COBERTURA;
        } else if (file !== "") {
            possibleType = CoverageType.LCOV;
        }
        this.type = possibleType;
    }
}

export class CoverageParser {
    private outputChannel: OutputChannel;

    constructor(outputChannel: OutputChannel) {
        this.outputChannel = outputChannel;
    }

    /**
     * Extracts coverage sections of type xml and lcov
     * @param files array of coverage files in string format
     */
    public async filesToSections(files: Map<string, string>): Promise<Map<string, Section>> {
        let coverages = new Map<string, Section>();

        for (const file of files) {
            const fileName = file[0];
            const fileContent = file[1];

            // file is an array
            let coverage = new Map<string, Section>();

            // get coverage file type
            const coverageFile = new CoverageFile(fileContent);
            switch (coverageFile.type) {
                case CoverageType.LCOV:
                    coverage = await this.lcovExtract(fileName, fileContent);
                    break;
                default:
                    break;
            }

            // add new coverage map to existing coverages generated so far
            coverages = new Map([...coverages, ...coverage]);
        }

        return coverages;
    }

    private async convertSectionsToMap(
        data: Section[],
    ): Promise<Map<string, Section>> {
        const sections = new Map<string, Section>();
        const addToSectionsMap = async (section: Section) => {
            sections.set(section.title + "::" + section.file, section);
        };

        // convert the array of sections into an unique map
        const addPromises = data.map(addToSectionsMap);
        await Promise.all(addPromises);
        return sections;
    }

    private lcovExtract(filename: string, lcovFile: string) {
        return new Promise<Map<string, Section>>((resolve) => {
            const checkError = (err: Error) => {
                if (err) {
                    err.message = `filename: ${filename} ${err.message}`;
                    this.handleError("lcov-parse", err);
                    return resolve(new Map<string, Section>());
                }
            };

            try {
                source(lcovFile, async (err, data) => {
                    checkError(err);
                    const sections = await this.convertSectionsToMap(data);
                    return resolve(sections);
                });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (error: any) {
                checkError(error);
            }
        });
    }

    private handleError(system: string, error: Error) {
        const message = error.message ? error.message : error;
        const stackTrace = error.stack;
        this.outputChannel.appendLine(
            `[${Date.now()}][coverageparser][${system}]: Error: ${message}`,
        );
        if (stackTrace) {
            this.outputChannel.appendLine(
                `[${Date.now()}][coverageparser][${system}]: Stacktrace: ${stackTrace}`,
            );
        }
    }
}
