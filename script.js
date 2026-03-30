let data = { groups: [] };

const modal = document.getElementById('modal');
const addBtn = document.getElementById('addBtn');
const closeBtn = document.querySelector('.close');
const websiteForm = document.getElementById('websiteForm');
const groupsContainer = document.getElementById('groupsContainer');
const groupNameInput = document.getElementById('groupName');

function openAddModal(preSelectedGroup = '') {
    modal.style.display = 'block';
    document.getElementById('modalTitle').textContent = '添加网站';
    websiteForm.reset();
    updateGroupSuggestions();
    if (preSelectedGroup) {
        document.getElementById('groupName').value = preSelectedGroup;
    }
}

addBtn.onclick = () => {
    openAddModal();
};

closeBtn.onclick = () => {
    modal.style.display = 'none';
};

window.onclick = (event) => {
    if (event.target === modal) {
        modal.style.display = 'none';
    }
};

function updateGroupSuggestions() {
    const datalist = document.createElement('datalist');
    datalist.id = 'groupSuggestions';
    data.groups.forEach(group => {
        const option = document.createElement('option');
        option.value = group.name;
        datalist.appendChild(option);
    });
    const existingDatalist = document.getElementById('groupSuggestions');
    if (existingDatalist) existingDatalist.remove();
    document.body.appendChild(datalist);
    groupNameInput.setAttribute('list', 'groupSuggestions');
}

async function loadData() {
    try {
        const response = await fetch('/api/data');
        data = await response.json();
        renderGroups();
    } catch (error) {
        console.error('加载数据失败:', error);
    }
}

async function saveData() {
    try {
        await fetch('/api/data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });
        renderGroups();
    } catch (error) {
        console.error('保存数据失败:', error);
    }
}

websiteForm.onsubmit = (e) => {
    e.preventDefault();
    
    const groupName = document.getElementById('groupName').value.trim();
    const websiteName = document.getElementById('websiteName').value.trim();
    const websiteUrl = document.getElementById('websiteUrl').value.trim();
    const websiteIcon = document.getElementById('websiteIcon').value.trim();

    let group = data.groups.find(g => g.name === groupName);
    if (group) {
        const groupIndex = data.groups.findIndex(g => g.name === groupName);
        data.groups.splice(groupIndex, 1);
    } else {
        group = { name: groupName, websites: [] };
    }

    group.websites.push({
        name: websiteName,
        url: websiteUrl,
        icon: websiteIcon || ''
    });
    
    data.groups.push(group);

    saveData();
    modal.style.display = 'none';
};

function deleteWebsite(groupName, websiteIndex) {
    const group = data.groups.find(g => g.name === groupName);
    if (group) {
        group.websites.splice(websiteIndex, 1);
        if (group.websites.length === 0) {
            const groupIndex = data.groups.findIndex(g => g.name === groupName);
            if (groupIndex !== -1) {
                data.groups.splice(groupIndex, 1);
            }
        }
        saveData();
    }
}

function openAllWebsites(groupName) {
    const group = data.groups.find(g => g.name === groupName);
    if (group) {
        group.websites.forEach(website => {
            window.open(website.url, '_blank');
        });
    }
}

function getInitials(name) {
    return name.charAt(0).toUpperCase();
}

function renderGroups() {
    groupsContainer.innerHTML = '';
    
    data.groups.forEach(group => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'group';
        
        const groupHeader = document.createElement('div');
        groupHeader.className = 'group-header';
        
        const groupTitle = document.createElement('h2');
        groupTitle.className = 'group-title';
        groupTitle.textContent = group.name;
        
        const openAllBtn = document.createElement('button');
        openAllBtn.className = 'btn btn-open-all';
        openAllBtn.textContent = '打开全部';
        openAllBtn.onclick = () => {
            openAllWebsites(group.name);
        };
        
        const addToGroupBtn = document.createElement('button');
        addToGroupBtn.className = 'btn btn-add-to-group';
        addToGroupBtn.textContent = '添加网址';
        addToGroupBtn.onclick = () => {
            openAddModal(group.name);
        };
        
        const buttonsContainer = document.createElement('div');
        buttonsContainer.style.display = 'flex';
        buttonsContainer.style.gap = '8px';
        buttonsContainer.appendChild(addToGroupBtn);
        buttonsContainer.appendChild(openAllBtn);
        
        groupHeader.appendChild(groupTitle);
        groupHeader.appendChild(buttonsContainer);
        groupDiv.appendChild(groupHeader);
        
        const websitesGrid = document.createElement('div');
        websitesGrid.className = 'websites-grid';
        
        group.websites.forEach((website, index) => {
            const websiteCard = document.createElement('a');
            websiteCard.href = website.url;
            websiteCard.target = '_blank';
            websiteCard.className = 'website-card';
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.innerHTML = '&times;';
            deleteBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                deleteWebsite(group.name, index);
            };
            websiteCard.appendChild(deleteBtn);
            
            const websiteIcon = document.createElement('div');
            websiteIcon.className = 'website-icon';
            
            if (website.icon) {
                const img = document.createElement('img');
                img.src = website.icon;
                img.alt = website.name;
                img.onerror = () => {
                    websiteIcon.innerHTML = getInitials(website.name);
                };
                websiteIcon.appendChild(img);
            } else {
                websiteIcon.textContent = getInitials(website.name);
            }
            
            websiteCard.appendChild(websiteIcon);
            
            const websiteName = document.createElement('div');
            websiteName.className = 'website-name';
            websiteName.textContent = website.name;
            websiteCard.appendChild(websiteName);
            
            websitesGrid.appendChild(websiteCard);
        });
        
        groupDiv.appendChild(websitesGrid);
        groupsContainer.appendChild(groupDiv);
    });
}

loadData();
