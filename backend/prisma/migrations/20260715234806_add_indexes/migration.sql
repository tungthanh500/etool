-- CreateIndex
CREATE INDEX "Attachment_documentId_idx" ON "Attachment"("documentId");

-- CreateIndex
CREATE INDEX "Document_creatorId_idx" ON "Document"("creatorId");

-- CreateIndex
CREATE INDEX "Document_workflowId_idx" ON "Document"("workflowId");

-- CreateIndex
CREATE INDEX "Document_status_idx" ON "Document"("status");

-- CreateIndex
CREATE INDEX "DocumentLog_documentId_idx" ON "DocumentLog"("documentId");

-- CreateIndex
CREATE INDEX "DocumentLog_userId_idx" ON "DocumentLog"("userId");

-- CreateIndex
CREATE INDEX "User_roleId_idx" ON "User"("roleId");

-- CreateIndex
CREATE INDEX "User_departmentId_idx" ON "User"("departmentId");

-- CreateIndex
CREATE INDEX "WorkflowStep_workflowId_idx" ON "WorkflowStep"("workflowId");
