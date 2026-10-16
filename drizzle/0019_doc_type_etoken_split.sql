-- "ETOKEN_ACK" was one slot standing for two different papers. The type is
-- now split into E_TOKEN and ACKNOWLEDGEMENT, so the rows already filed
-- under the old name move to E_TOKEN — that is the file the old slot asked
-- for by its hint ("auto-generated on PM Surya Ghar"). Anything that turns
-- out to be the acknowledgement can be re-filed from the documents page;
-- left as ETOKEN_ACK it would show up with a raw key for a label instead.
UPDATE "documents" SET "doc_type" = 'E_TOKEN' WHERE "doc_type" = 'ETOKEN_ACK';--> statement-breakpoint
UPDATE "document_templates" SET "doc_type" = 'E_TOKEN' WHERE "doc_type" = 'ETOKEN_ACK';
