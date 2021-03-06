import { container } from "tsyringe";
import {
  Hover,
  Connection,
  MarkupKind,
  TextDocumentPositionParams,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import { SyntaxNode } from "web-tree-sitter";
import { DiagnosticsProvider } from ".";
import { getEmptyTypes } from "../util/elmUtils";
import { ElmWorkspaceMatcher } from "../util/elmWorkspaceMatcher";
import { HintHelper } from "../util/hintHelper";
import { NodeType, TreeUtils } from "../util/treeUtils";
import { ITextDocumentPositionParams } from "./paramsExtensions";

type HoverResult = Hover | null | undefined;

export class HoverProvider {
  private connection: Connection;
  private diagnostics: DiagnosticsProvider;

  constructor() {
    this.connection = container.resolve<Connection>("Connection");
    this.diagnostics = container.resolve(DiagnosticsProvider);
    this.connection.onHover(
      this.diagnostics.interruptDiagnostics(() =>
        new ElmWorkspaceMatcher((params: TextDocumentPositionParams) =>
          URI.parse(params.textDocument.uri),
        ).handle(this.handleHoverRequest.bind(this)),
      ),
    );
  }

  protected handleHoverRequest = (
    params: ITextDocumentPositionParams,
  ): HoverResult => {
    this.connection.console.info(`A hover was requested`);

    const checker = params.program.getTypeChecker();
    const treeContainer = params.sourceFile;

    if (treeContainer) {
      const nodeAtPosition = TreeUtils.getNamedDescendantForPosition(
        treeContainer.tree.rootNode,
        params.position,
      );

      const definitionNode = checker.findDefinition(
        nodeAtPosition,
        treeContainer,
      );

      if (definitionNode) {
        if (
          definitionNode.node.type === "function_declaration_left" &&
          definitionNode.node.parent
        ) {
          definitionNode.node = definitionNode.node.parent;
        }

        const typeString = checker.typeToString(
          checker.findType(definitionNode.node),
          treeContainer,
        );

        return this.createMarkdownHoverFromDefinition(
          definitionNode,
          typeString,
        );
      } else {
        const specialMatch = getEmptyTypes().find(
          (a) => a.name === nodeAtPosition.text,
        );
        if (specialMatch) {
          return {
            contents: {
              kind: MarkupKind.Markdown,
              value: specialMatch.markdown,
            },
          };
        }
      }
    }
  };

  private createMarkdownHoverFromDefinition(
    definitionNode:
      | { node: SyntaxNode; uri: string; nodeType: NodeType }
      | undefined,
    typeString: string,
  ): Hover | undefined {
    if (definitionNode) {
      const value =
        definitionNode.nodeType === "FunctionParameter" ||
        definitionNode.nodeType === "AnonymousFunctionParameter" ||
        definitionNode.nodeType === "CasePattern"
          ? HintHelper.createHintFromFunctionParameter(
              definitionNode.node,
              typeString,
            )
          : HintHelper.createHint(definitionNode.node, typeString);

      if (value) {
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value,
          },
        };
      }
    }
  }
}
