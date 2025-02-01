const openPopupLink = document.getElementById('open-popup');
const popup = document.getElementById('popup');
const overlay = document.getElementById('popup-overlay');
const closePopup = document.getElementById('close-popup');
function showPopup() {
    popup.classList.add('show');
    overlay.classList.add('show');
}
function hidePopup() {
    popup.classList.remove('show');
    overlay.classList.remove('show');
}
openPopupLink.addEventListener('click', function(event) {
    event.preventDefault();
    showPopup();
});
closePopup.addEventListener('click', hidePopup);
overlay.addEventListener('click', hidePopup);
const urlParams = new URLSearchParams(window.location.search);
const error = urlParams.get('error');
if(error){
    const errorMessage = document.getElementById('error-message');
    errorMessage.style.display = 'block';
}